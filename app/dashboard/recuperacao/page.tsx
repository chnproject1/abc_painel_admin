"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/* Visão de recuperação de pedidos: quantas mensagens saíram e quanto cada uma
   trouxe de volta. Página à parte, sem card na visão geral: não há entrega
   aqui, só percentuais. Seletor de período no estilo da UTMify, padrão Hoje.
   Duas operações, mesmo desenho:
     BR    — WhatsApp (Power Automate), mensagem 1 preço cheio + mensagem 2 com 15%
     LATAM — 1 e-mail já com desconto (silver US$9, basic US$7), com upsells depois */

type Op = "br" | "es";
const OPS: { valor: Op; rotulo: string }[] = [
  { valor: "br", rotulo: "🇧🇷 BR" },
  { valor: "es", rotulo: "🌎 LATAM" },
];

type Etapa = { enviadas: number; cliques: number; cliques_sem_pagar: number; compras: number; taxa: number; receita: number; ticket: number };
type Stats = {
  resumo: { elegiveis: number; com_mensagem: number; sem_mensagem: number; recuperados: number; taxa: number; receita: number; entregues?: number };
  etapas: { m1: Etapa; m2: Etapa };
  motivos?: Record<string, { escolheram: number; recuperados: number }>;
};

/* Motivos da tela "¿Qué te detuvo?" do funil de recuperação LATAM */
const MOTIVOS: { key: string; rotulo: string; acao: string }[] = [
  { key: "precio",       rotulo: "💸 Preço",                  acao: "vai direto pra oferta" },
  { key: "letra",        rotulo: "✍️ Queria mudar a letra",    acao: "escreve o ajuste e a IA reescreve (até 2x)" },
  { key: "estilo",       rotulo: "🎵 Queria outro estilo",     acao: "troca o estilo musical" },
  { key: "dudas",        rotulo: "🤔 Dúvida / desconfiança",   acao: "garantia, como funciona, depoimentos" },
  { key: "pago",         rotulo: "💳 Pagamento não passou",    acao: "dicas de cartão / Apple Pay / Google Pay" },
  { key: "momento",      rotulo: "⏰ Não era o momento / outro", acao: "\"tú eliges cuándo darla\"" },
  { key: "direto",       rotulo: "➡️ Foi direto ao pagamento", acao: "pulou a pergunta" },
  { key: "sem_resposta", rotulo: "— Sem resposta",             acao: "recebeu o e-mail e não escolheu motivo" },
];

type Periodo = "maximo" | "hoje" | "ontem" | "7dias" | "mes" | "mes_passado" | "personalizado";
const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "maximo",        rotulo: "Máximo" },
  { valor: "hoje",          rotulo: "Hoje" },
  { valor: "ontem",         rotulo: "Ontem" },
  { valor: "7dias",         rotulo: "Últimos 7 dias" },
  { valor: "mes",           rotulo: "Esse mês" },
  { valor: "mes_passado",   rotulo: "Mês passado" },
  { valor: "personalizado", rotulo: "Personalizado" },
];

// Datas em horário de Brasília, como YYYY-MM-DD (o servidor converte)
function diaBR(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function somaDias(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function intervalo(p: Periodo, de: string, ate: string): { desde?: string; ate?: string } {
  const hoje = new Date();
  const h = diaBR(hoje);
  switch (p) {
    case "maximo": return {};
    case "hoje": return { desde: h, ate: h };
    case "ontem": { const o = diaBR(somaDias(hoje, -1)); return { desde: o, ate: o }; }
    case "7dias": return { desde: diaBR(somaDias(hoje, -6)), ate: h };
    case "mes": return { desde: h.slice(0, 8) + "01", ate: h };
    case "mes_passado": {
      const [y, m] = h.split("-").map(Number);
      const ini = new Date(Date.UTC(y, m - 2, 1)), fim = new Date(Date.UTC(y, m - 1, 0));
      return { desde: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
    }
    case "personalizado": return { desde: de || undefined, ate: ate || undefined };
  }
}

const pct = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";
const dinheiro = (op: Op) => (v: number) =>
  op === "es" ? "US$" + v.toFixed(2) : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RecuperacaoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [op, setOp] = useState<Op>("br");
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && !isAdmin) router.push("/dashboard");
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    if (periodo === "personalizado" && (!de || !ate)) return;
    const q = intervalo(periodo, de, ate);
    const qs = new URLSearchParams();
    qs.set("op", op);
    if (q.desde) qs.set("desde", q.desde);
    if (q.ate) qs.set("ate", q.ate);
    setCarregando(true); setErro(""); setStats(null);
    fetch(`/api/recuperacao/stats?${qs}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`); return r.json(); })
      .then(setStats)
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [isAdmin, op, periodo, de, ate]);

  if (status === "loading" || !isAdmin) return null;

  const r = stats?.resumo;
  const e = stats?.etapas;
  const brl = dinheiro(op);
  const es = op === "es";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard")} className="text-sm text-gray-500 hover:text-gray-800 font-medium shrink-0">
          ⌂ Início
        </button>
        <h1 className="text-base font-bold text-gray-900">Recuperação de pedidos</h1>
        <div className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden">
          {OPS.map(o => (
            <button key={o.valor} onClick={() => setOp(o.valor)}
                    className={`px-3 py-1.5 text-sm font-medium ${op === o.valor ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {o.rotulo}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Período, no estilo da UTMify */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">Período de visualização</span>
            <select value={periodo} onChange={ev => setPeriodo(ev.target.value as Periodo)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[200px]">
              {PERIODOS.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </label>
          {periodo === "personalizado" && (
            <>
              <label className="text-sm"><span className="block text-xs text-gray-500 mb-1">De</span>
                <input type="date" value={de} onChange={ev => setDe(ev.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
              <label className="text-sm"><span className="block text-xs text-gray-500 mb-1">Até</span>
                <input type="date" value={ate} onChange={ev => setAte(ev.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
            </>
          )}
          <span className="text-xs text-gray-400 ml-auto">{carregando ? "Carregando..." : "Conta pela data do pedido original"}</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-4 text-sm text-gray-600 space-y-1">
          {es ? (
            <>
              <p><b className="text-gray-800">LATAM:</b> 1 e-mail (Resend) para pedidos <b>pendentes há mais de 30 min</b> (até 7 dias), uma vez só. Quem pagou depois com o mesmo e-mail não recebe.</p>
              <p>O link abre o <b>funil de recuperação</b>: "¿Qué te detuvo?" → resolve o motivo (tabela abaixo) → <b>oferta única: Silver com entrega hoje por US$9</b> (de US$12) → upsells normais (página, vídeo, downsell).</p>
              <p>Se a pessoa pede outra letra (IA) ou outro estilo, o pedido novo já sai com eles; o original fica como histórico e vira "recuperado" quando o novo é pago.</p>
              <p className="text-xs text-gray-400">Power Automate a cada 10 min → <code>/api/es/recuperacao</code> → n8n "ES - Recuperação" → e-mail com <code>?p=&lt;pedido&gt;</code>. A receita inclui os upsells do pedido recuperado.</p>
            </>
          ) : (
            <>
              <p><b className="text-gray-800">BR:</b> WhatsApp (Power Automate) — mensagem 1 com preço cheio, mensagem 2 com 15% de desconto.</p>
              <p>O link <code>/recuperar/?p=&lt;pedido&gt;</code> gera um PIX novo; o pedido original vira "recuperado" quando o novo é pago.</p>
            </>
          )}
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        {/* Resumo */}
        {r && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card rotulo="Pendentes elegíveis" valor={String(r.elegiveis)} nota={`${r.sem_mensagem} ainda sem mensagem`} />
            <Card rotulo={es ? "E-mails enviados" : "Receberam mensagem"} valor={String(r.com_mensagem)}
                  nota={es && r.entregues !== undefined ? `${r.entregues} entregues · ${r.com_mensagem - r.entregues} sem confirmação ou bounce` : undefined} />
            <Card rotulo="Recuperados" valor={String(r.recuperados)} nota={brl(r.receita)} cor="text-avocado-700" />
            <Card rotulo="Taxa geral" valor={pct(r.taxa)} nota={es ? "recuperados ÷ entregues" : "recuperados ÷ com mensagem"} cor="text-avocado-700" />
          </div>
        )}

        {/* Por mensagem */}
        {e && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Etapa</th>
                  <th className="text-right px-4 py-3">Enviadas</th>
                  <th className="text-right px-4 py-3">Abriram o link</th>
                  <th className="text-right px-4 py-3">Compras</th>
                  <th className="text-right px-4 py-3">Taxa</th>
                  <th className="text-right px-4 py-3">Receita</th>
                  <th className="text-right px-4 py-3">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {es ? (
                  <LinhaEtapa nome="E-mail" sub="Silver, entrega hoje, US$9" d={e.m1} brl={brl} />
                ) : (
                  <>
                    <LinhaEtapa nome="Mensagem 1" sub="preço cheio" d={e.m1} brl={brl} />
                    <LinhaEtapa nome="Mensagem 2" sub="15% de desconto" d={e.m2} brl={brl} />
                  </>
                )}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{e.m1.enviadas + e.m2.enviadas}</td>
                  <td className="px-4 py-3 text-right">{e.m1.cliques + e.m2.cliques}</td>
                  <td className="px-4 py-3 text-right">{e.m1.compras + e.m2.compras}</td>
                  <td className="px-4 py-3 text-right">{r ? pct(r.taxa) : "—"}</td>
                  <td className="px-4 py-3 text-right">{brl(e.m1.receita + e.m2.receita)}</td>
                  <td className="px-4 py-3 text-right">—</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-400 px-4 py-3 border-t border-gray-100">
              "Enviadas" = pedidos que receberam aquela mensagem (contador do fluxo). "Abriram o link" = pedidos novos criados pelo link;
              entre parênteses, os que abriram e não pagaram. A compra é atribuída à mensagem em que o pedido original parou.
              Histórico começa com o fluxo novo de recuperação.
            </p>
          </div>
        )}
        {/* LATAM: por motivo */}
        {es && stats?.motivos && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">Por motivo — "¿Qué te detuvo?"</p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Motivo</th>
                  <th className="text-left px-4 py-3">O que a página faz</th>
                  <th className="text-right px-4 py-3">Escolheram</th>
                  <th className="text-right px-4 py-3">Pagaram</th>
                  <th className="text-right px-4 py-3">Taxa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MOTIVOS.map(m => {
                  const d = stats.motivos![m.key] ?? { escolheram: 0, recuperados: 0 };
                  return (
                    <tr key={m.key} className={d.escolheram ? "" : "text-gray-400"}>
                      <td className="px-4 py-3 font-medium">{m.rotulo}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{m.acao}</td>
                      <td className="px-4 py-3 text-right">{d.escolheram}</td>
                      <td className="px-4 py-3 text-right">{d.recuperados}</td>
                      <td className="px-4 py-3 text-right font-semibold text-avocado-700">{d.escolheram ? pct(d.recuperados / d.escolheram) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Card({ rotulo, valor, nota, cor }: { rotulo: string; valor: string; nota?: string; cor?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <p className={`text-2xl font-bold mt-1 ${cor ?? "text-gray-900"}`}>{valor}</p>
      {nota && <p className="text-xs text-gray-400 mt-1">{nota}</p>}
    </div>
  );
}

function LinhaEtapa({ nome, sub, d, brl }: { nome: string; sub: string; d: Etapa; brl: (v: number) => string }) {
  return (
    <tr>
      <td className="px-4 py-3"><span className="font-medium text-gray-900">{nome}</span><span className="block text-xs text-gray-400">{sub}</span></td>
      <td className="px-4 py-3 text-right">{d.enviadas}</td>
      <td className="px-4 py-3 text-right">{d.cliques}{d.cliques_sem_pagar ? <span className="text-gray-400"> ({d.cliques_sem_pagar} sem pagar)</span> : null}</td>
      <td className="px-4 py-3 text-right font-medium">{d.compras}</td>
      <td className="px-4 py-3 text-right font-semibold text-avocado-700">{pct(d.taxa)}</td>
      <td className="px-4 py-3 text-right">{brl(d.receita)}</td>
      <td className="px-4 py-3 text-right text-gray-500">{d.compras ? brl(d.ticket) : "—"}</td>
    </tr>
  );
}
