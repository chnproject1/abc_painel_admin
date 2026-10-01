import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* Visão de recuperação de pedidos (só admin, só leitura), por operação:
     ?op=br  (padrão) — tabela Pedido, WhatsApp pelo Power Automate, 2 mensagens
     ?op=es           — tabela PedidoEs, 1 e-mail já com desconto (/api/es/recuperacao)
   Modelo, igual nas duas:
     - principal: recovery_id NULL; `recuperacao` conta as mensagens enviadas (1, 2)
     - filha: recovery_id = id da principal; nasce quando o cliente abre o link
     - quando uma filha é paga, a principal vira `recuperado` e o contador para
   Então a etapa em que a compra aconteceu é o `recuperacao` da própria principal.
   O período filtra pela data do pedido PRINCIPAL. Datas chegam como YYYY-MM-DD
   em horário de Brasília; sem `desde` = máximo.
   No ES a receita da filha soma os upsells pagos depois da recuperação. */

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

type Linha = { recuperacao: number; status: string; n: number };
type LinhaFilha = { etapa: number; pagou: boolean; n: number; receita: number };
type LinhaMotivo = { motivo: string | null; recuperado: boolean; n: number };

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Só admin" }, { status: 403 });

  const es = req.nextUrl.searchParams.get("op") === "es";
  const tabela = Prisma.raw(es ? `"PedidoEs"` : `"Pedido"`);
  const receitaFilha = es
    ? Prisma.sql`c.valor + COALESCE(CASE WHEN c.up1_status = 'pago' THEN c.up1_valor END, 0)
                         + COALESCE(CASE WHEN c.up2_status = 'pago' THEN c.up2_valor END, 0)
                         + COALESCE(CASE WHEN c.ds_status  = 'pago' THEN c.ds_valor  END, 0)`
    : Prisma.sql`c.valor`;

  const desdeParam = req.nextUrl.searchParams.get("desde");
  const ateParam   = req.nextUrl.searchParams.get("ate");
  const desde = desdeParam && DIA_RE.test(desdeParam) ? new Date(`${desdeParam}T00:00:00.000-03:00`) : new Date("2000-01-01T00:00:00Z");
  const ate   = ateParam   && DIA_RE.test(ateParam)   ? new Date(`${ateParam}T23:59:59.999-03:00`)   : new Date("2100-01-01T00:00:00Z");

  const [principais, filhas] = await Promise.all([
    prisma.$queryRaw<Linha[]>`
      SELECT recuperacao, status, COUNT(*)::int AS n
      FROM ${tabela}
      WHERE recovery_id IS NULL
        AND data_pedido >= ${desde} AND data_pedido <= ${ate}
        AND status IN ('pendente', 'recuperado')
      GROUP BY recuperacao, status`,
    /* Etapa do clique (linha filha):
         1. `funil` da filha, gravado pela página a partir do link (&r=2) — o
            jeito certo, desde 21/09;
         2. sem isso: se a principal já está na 2 e a filha nasceu ANTES da
            mensagem 2 sair (`atualizado_em` da principal), foi clique da 1;
         3. principal `recuperado`: vale o contador dela, que para na compra.
       Conta PESSOAS (pedido original), não PIX: quem clica 3 vezes gera 3 filhas
       e conta 1 clique na etapa. */
    prisma.$queryRaw<LinhaFilha[]>`
      SELECT etapa, pagou, COUNT(*)::int AS n, COALESCE(SUM(receita), 0)::float AS receita
      FROM (
        SELECT p.id,
               CASE
                 WHEN c.funil = 'recuperacao-2' THEN 2
                 WHEN c.funil = 'recuperacao-1' THEN 1
                 WHEN p.status = 'recuperado' THEN p.recuperacao
                 WHEN p.recuperacao = 2 AND c.data_pedido < p.atualizado_em THEN 1
                 ELSE p.recuperacao
               END AS etapa,
               bool_or(c.status = 'pago') AS pagou,
               SUM(CASE WHEN c.status = 'pago' THEN ${receitaFilha} ELSE 0 END) AS receita
        FROM ${tabela} c
        JOIN ${tabela} p ON p.id = c.recovery_id
        WHERE p.data_pedido >= ${desde} AND p.data_pedido <= ${ate}
        GROUP BY p.id, 2
      ) x
      GROUP BY etapa, pagou`,
  ]);

  /* LATAM: o que travou a compra, escolhido na tela do link. Conta os pedidos
     que receberam o e-mail; "sem resposta" = abriu ou não, mas não escolheu. */
  const motivos = es ? await prisma.$queryRaw<LinhaMotivo[]>`
      SELECT recuperacao_motivo AS motivo, (status = 'recuperado') AS recuperado, COUNT(*)::int AS n
      FROM "PedidoEs"
      WHERE recovery_id IS NULL AND recuperacao >= 1
        AND data_pedido >= ${desde} AND data_pedido <= ${ate}
      GROUP BY 1, 2` : [];
  // LATAM: e-mails que o Resend confirmou como entregues (resultado do fluxo n8n)
  const entregues = es ? Number((await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "PedidoEs"
      WHERE recovery_id IS NULL AND recuperacao >= 1 AND recuperacao_entrega = 'entregue'
        AND data_pedido >= ${desde} AND data_pedido <= ${ate}`)[0]?.n ?? 0) : null;
  const porMotivo: Record<string, { escolheram: number; recuperados: number }> = {};
  for (const l of motivos) {
    const k = l.motivo || "sem_resposta";
    porMotivo[k] ??= { escolheram: 0, recuperados: 0 };
    porMotivo[k].escolheram += l.n;
    if (l.recuperado) porMotivo[k].recuperados += l.n;
  }

  const soma = (cond: (l: Linha) => boolean) => principais.filter(cond).reduce((a, l) => a + l.n, 0);
  const somaF = (cond: (l: LinhaFilha) => boolean, campo: "n" | "receita") =>
    filhas.filter(cond).reduce((a, l) => a + Number(l[campo]), 0);

  const etapa = (k: number) => {
    const enviadas = soma(l => l.recuperacao >= k);                          // recebeu a mensagem k
    const compras  = soma(l => l.recuperacao === k && l.status === "recuperado");
    // Filhas atribuídas à etapa em que a principal está (quando compra, o contador para nela)
    const cliques  = somaF(l => l.etapa === k, "n");
    const cliques_sem_pagar = somaF(l => l.etapa === k && !l.pagou, "n");
    const receita  = somaF(l => l.etapa === k, "receita");
    return { enviadas, cliques, cliques_sem_pagar, compras, taxa: enviadas ? compras / enviadas : 0, receita,
             ticket: compras ? receita / compras : 0 };
  };

  const m1 = etapa(1), m2 = etapa(2);
  const elegiveis   = soma(() => true);                                        // principais que não pagaram direto
  const com_mensagem = soma(l => l.recuperacao >= 1);
  const recuperados = soma(l => l.status === "recuperado" && l.recuperacao >= 1);
  const sem_mensagem = soma(l => l.recuperacao === 0 && l.status === "pendente");

  return NextResponse.json({
    operacao: es ? "es" : "br",
    periodo: { desde: desdeParam || null, ate: ateParam || null },
    resumo: {
      elegiveis, com_mensagem, sem_mensagem, recuperados,
      // LATAM: taxa sobre os ENTREGUES (bounce não conta como oportunidade)
      ...(es ? { entregues } : {}),
      taxa: (es ? entregues : com_mensagem) ? recuperados / (es ? entregues! : com_mensagem) : 0,
      receita: m1.receita + m2.receita,
    },
    etapas: { m1, m2 },
    ...(es ? { motivos: porMotivo } : {}),
  });
}
