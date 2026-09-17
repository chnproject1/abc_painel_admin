import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* Visão de recuperação de pedidos (só admin, só leitura).
   Modelo, como combinado com o fluxo do Power Automate:
     - principal: recovery_id NULL; `recuperacao` conta as mensagens enviadas (1, 2)
     - filha: recovery_id = id da principal; nasce quando o cliente abre o link
     - quando uma filha é paga, a principal vira `recuperado` e o contador para
   Então a etapa em que a compra aconteceu é o `recuperacao` da própria principal.
   O período filtra pela data do pedido PRINCIPAL. Datas chegam como YYYY-MM-DD
   em horário de Brasília; sem `desde` = máximo. */

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

type Linha = { recuperacao: number; status: string; n: number };
type LinhaFilha = { etapa: number; status: string; n: number; receita: number };

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") return NextResponse.json({ error: "Só admin" }, { status: 403 });

  const desdeParam = req.nextUrl.searchParams.get("desde");
  const ateParam   = req.nextUrl.searchParams.get("ate");
  const desde = desdeParam && DIA_RE.test(desdeParam) ? new Date(`${desdeParam}T00:00:00.000-03:00`) : new Date("2000-01-01T00:00:00Z");
  const ate   = ateParam   && DIA_RE.test(ateParam)   ? new Date(`${ateParam}T23:59:59.999-03:00`)   : new Date("2100-01-01T00:00:00Z");

  const [principais, filhas] = await Promise.all([
    prisma.$queryRaw<Linha[]>`
      SELECT recuperacao, status, COUNT(*)::int AS n
      FROM "Pedido"
      WHERE recovery_id IS NULL
        AND data_pedido >= ${desde} AND data_pedido <= ${ate}
        AND status IN ('pendente', 'recuperado')
      GROUP BY recuperacao, status`,
    prisma.$queryRaw<LinhaFilha[]>`
      SELECT p.recuperacao AS etapa, c.status, COUNT(*)::int AS n,
             COALESCE(SUM(CASE WHEN c.status = 'pago' THEN c.valor ELSE 0 END), 0)::float AS receita
      FROM "Pedido" c
      JOIN "Pedido" p ON p.id = c.recovery_id
      WHERE p.data_pedido >= ${desde} AND p.data_pedido <= ${ate}
      GROUP BY p.recuperacao, c.status`,
  ]);

  const soma = (cond: (l: Linha) => boolean) => principais.filter(cond).reduce((a, l) => a + l.n, 0);
  const somaF = (cond: (l: LinhaFilha) => boolean, campo: "n" | "receita") =>
    filhas.filter(cond).reduce((a, l) => a + Number(l[campo]), 0);

  const etapa = (k: number) => {
    const enviadas = soma(l => l.recuperacao >= k);                          // recebeu a mensagem k
    const compras  = soma(l => l.recuperacao === k && l.status === "recuperado");
    // Filhas atribuídas à etapa em que a principal está (quando compra, o contador para nela)
    const cliques  = somaF(l => l.etapa === k, "n");
    const cliques_sem_pagar = somaF(l => l.etapa === k && l.status !== "pago", "n");
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
    periodo: { desde: desdeParam || null, ate: ateParam || null },
    resumo: {
      elegiveis, com_mensagem, sem_mensagem, recuperados,
      taxa: com_mensagem ? recuperados / com_mensagem : 0,
      receita: m1.receita + m2.receita,
    },
    etapas: { m1, m2 },
  });
}
