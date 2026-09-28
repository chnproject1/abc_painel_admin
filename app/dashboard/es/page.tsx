"use client";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SeletorPais from "@/components/SeletorPais";
import { estadoVideoEs, type VideoResumoEs } from "@/lib/video-estado";
import { ROTULO_FILTRO_ES } from "@/lib/es-resumo";

interface PedidoEs {
  id: string;
  nome: string;
  email: string;
  plano: string;
  status: string;
  up1_status?: string | null;
  up2_status?: string | null;
  ds_status?: string | null;
  estilo?: string;
  gerou_musica: boolean;
  up_gerou_musica: boolean;
  link_audio?: string;
  link_pagina?: string;
  data_entrega?: string;
  data_pedido?: string;
  entrega_email?: boolean;
  up_entrega_email?: boolean;
  video?: VideoResumoEs | null;   // só pedido novo (LATAM) com vídeo comprado
}

/* Resposta de /api/es/resumo (regras em lib/es-resumo.ts) */
interface ResumoEs {
  entregas: {
    musica: { compraram: number; producao: number; pendente: number; entregue: number; erro: number; sem_rastreio: number };
    pagina: { compraram: number; aguardando: number; pendente: number; entregue: number; sem_rastreio: number };
    video:  { compraram: number; aguardando: number; producao: number; pendente: number; entregue: number; erro: number; sem_rastreio: number };
  };
  rastreio: { oferta: string; rotulo: string; vendas: number; rastreadas: number; sem_rastreio: number; receita: number }[];
}

const STATUS_COR: Record<string, string> = {
  pendente:  "bg-gray-100 text-gray-500",
  pago:      "bg-green-100 text-green-700",
  recusado:  "bg-gray-100 text-gray-400",
  cancelado: "bg-red-100 text-red-700",
};

const FILTRO_LABEL: Record<string, string> = {
  todos:        "Todos os pedidos",
  pagos:        "Compraram",
  pendentes:    "Pendentes envio",
  erro:         "Erro de geração",
  up1:          "Compraram o upsell 1 (Página Premium)",
  up2:          "Compraram o upsell 2 (Vídeo)",
  ds:           "Compraram o downsell",
  pendentes_up: "Músicas extras pendentes (pedidos antigos)",
  erro_up:      "Erro de geração (músicas extras, pedidos antigos)",
  video:           "Vídeo: compraram",
  video_sem_fotos: "Vídeo: sem fotos",
  video_pendentes: "Vídeo: pendentes envio",
  video_erro:      "Vídeo: erro de geração",
  rastreio:        "Sem rastreio (venda da frente)",
  video_rastreio:  "Vídeo: sem rastreio (up2 / ds2 / ds3)",
};

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

/* Célula clicável das tabelas da visão geral: abre a lista com a MESMA regra
   que contou o número. Zero fica cinza; pendência amarela; erro vermelho.
   `valor` undefined = a coluna não se aplica àquele produto (—). */
function Num({
  valor, chave, tom = "neutro", ativo, onClick,
}: {
  valor?: number; chave?: string; tom?: "neutro" | "pendencia" | "erro" | "ok";
  ativo: string | null; onClick: (chave: string) => void;
}) {
  if (valor === undefined) return <td className="px-3 py-2.5 text-right text-gray-300">—</td>;
  const zero = valor === 0;
  const cor = zero ? "text-gray-300"
    : tom === "erro"      ? "bg-red-50 text-red-700 font-semibold"
    : tom === "pendencia" ? "bg-yellow-50 text-yellow-800 font-semibold"
    : tom === "ok"        ? "text-avocado-700"
    : "text-gray-800";
  const clicavel = !!chave && !zero;
  return (
    <td className="px-1 py-1 text-right">
      <button
        type="button"
        disabled={!clicavel}
        onClick={() => chave && onClick(chave)}
        className={`w-full rounded-md px-2 py-1.5 tabular-nums text-sm transition-colors ${cor} ${clicavel ? "hover:ring-1 hover:ring-gray-300" : "cursor-default"} ${ativo === chave ? "ring-2 ring-gray-500" : ""}`}
      >
        {valor.toLocaleString("pt-BR")}
      </button>
    </td>
  );
}

/* Cores dos cards — as mesmas do painel BR (Total branco, Pagas verde,
   Pendentes amarelo, Erro vermelho, Sem rastreio azul), mais cinza pra
   "aguardando" (depende do cliente ou da música) e ciano pra "em produção". */
const COR = {
  total:      "bg-white border-gray-200 text-gray-800",
  aguardando: "bg-gray-50 border-gray-200 text-gray-600",
  producao:   "bg-sky-50 border-sky-200 text-sky-800",
  pendente:   "bg-yellow-50 border-yellow-200 text-yellow-800",
  entregue:   "bg-green-50 border-green-200 text-green-800",
  erro:       "bg-red-50 border-red-200 text-red-800",
  rastreio:   "bg-blue-50 border-blue-200 text-blue-800",
};

/* Card compacto (versão menor do StatCard do BR): abre a lista com a mesma
   regra que contou o número. */
function MiniCard({
  rotulo, valor, chave, cor, ativo, onClick,
}: {
  rotulo: string; valor: number; chave: string; cor: string; ativo: string | null; onClick: (chave: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(chave)}
      className={`rounded-lg border px-3 py-2 text-left w-full transition-all hover:opacity-90 hover:shadow-sm ${cor} ${
        ativo === chave ? "ring-2 ring-offset-1 ring-current" : ""
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-70 leading-tight truncate">{rotulo}</p>
      <p className="text-xl font-bold tabular-nums leading-tight mt-0.5">{valor.toLocaleString("pt-BR")}</p>
    </button>
  );
}

function LinhaProduto({
  titulo, detalhe, cards, ativo, onClick,
}: {
  titulo: string; detalhe?: string; ativo: string | null; onClick: (chave: string) => void;
  cards: { rotulo: string; valor: number; chave: string; cor: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">
        {titulo} {detalhe && <span className="text-xs font-normal text-gray-400">{detalhe}</span>}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {cards.map(c => <MiniCard key={c.chave} {...c} ativo={ativo} onClick={onClick} />)}
      </div>
    </div>
  );
}

function VisaoGeralEs({ r, ativo, onClick }: { r: ResumoEs; ativo: string | null; onClick: (chave: string) => void }) {
  const { musica, pagina, video } = r.entregas;
  const semRastreio = r.rastreio.filter(x => x.sem_rastreio > 0);
  const totalSemRastreio = semRastreio.reduce((t, x) => t + x.sem_rastreio, 0);

  /* Só o que é trabalho da operação. "Aguardando" (fotos do cliente, música
     ficar pronta) e "em produção" são o fluxo andando, não pendência. */
  const atencao: { chave: string; texto: string; erro?: boolean }[] = [];
  if (musica.erro)      atencao.push({ chave: "musica_erro", texto: `${musica.erro} música(s) com erro de geração`, erro: true });
  if (musica.pendente)  atencao.push({ chave: "musica_pendente", texto: `${musica.pendente} música(s) sem entregar` });
  if (pagina.pendente)  atencao.push({ chave: "pagina_pendente", texto: `${pagina.pendente} página(s) sem entregar` });
  if (video.erro)       atencao.push({ chave: "video_erro", texto: `${video.erro} vídeo(s) com erro`, erro: true });
  if (video.pendente)   atencao.push({ chave: "video_pendentes", texto: `${video.pendente} vídeo(s) pendente(s) de envio` });
  if (totalSemRastreio) atencao.push({ chave: "rastreio", texto: `${totalSemRastreio} venda(s) sem rastreio (${semRastreio.map(x => `${x.oferta}: ${x.sem_rastreio}`).join(" · ")})` });

  const th = "px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap";
  const thNome = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400";
  const nomeLinha = "px-3 py-2.5 text-sm text-gray-700 whitespace-nowrap";
  const totalVendas = r.rastreio.reduce((t, x) => t + x.vendas, 0);
  const totalRastreadas = r.rastreio.reduce((t, x) => t + x.rastreadas, 0);
  const receitaTotal = r.rastreio.reduce((t, x) => t + x.receita, 0);

  return (
    <div className="mb-6 space-y-4">
      {/* Precisa de atenção */}
      <div className={`rounded-xl border p-4 ${atencao.length ? "bg-yellow-50 border-yellow-200" : "bg-avocado-50 border-avocado-200"}`}>
        {atencao.length === 0 ? (
          <p className="text-sm font-medium text-avocado-700">✓ Tudo entregue e rastreado.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-yellow-900 mr-1">⚠ Precisa de atenção</span>
            {atencao.map(a => (
              <button key={a.chave} type="button" onClick={() => onClick(a.chave)}
                className={`text-sm px-2.5 py-1 rounded-full border transition-colors ${a.erro ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" : "bg-white border-yellow-300 text-yellow-900 hover:bg-yellow-100"} ${ativo === a.chave ? "ring-2 ring-gray-500" : ""}`}>
                {a.texto}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Entregas — uma linha de cards por produto, nas cores do BR */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entregas</p>
        <LinhaProduto titulo="🎵 Música" ativo={ativo} onClick={onClick} cards={[
          { rotulo: "Compraram",       valor: musica.compraram,    chave: "musica",              cor: COR.total },
          { rotulo: "Em produção",     valor: musica.producao,     chave: "musica_producao",     cor: COR.producao },
          { rotulo: "Pendente envio",  valor: musica.pendente,     chave: "musica_pendente",     cor: COR.pendente },
          { rotulo: "Entregue",        valor: musica.entregue,     chave: "musica_entregue",     cor: COR.entregue },
          { rotulo: "Erro de geração", valor: musica.erro,         chave: "musica_erro",         cor: COR.erro },
          { rotulo: "Sem rastreio",    valor: musica.sem_rastreio, chave: "sem_rastreio_musica", cor: COR.rastreio },
        ]} />
        <LinhaProduto titulo="✨ Página Premium" detalhe="up1 · ds1 · ds3" ativo={ativo} onClick={onClick} cards={[
          { rotulo: "Compraram",         valor: pagina.compraram,    chave: "pagina",              cor: COR.total },
          { rotulo: "Aguardando música", valor: pagina.aguardando,   chave: "pagina_aguardando",   cor: COR.aguardando },
          { rotulo: "Pendente envio",    valor: pagina.pendente,     chave: "pagina_pendente",     cor: COR.pendente },
          { rotulo: "Entregue",          valor: pagina.entregue,     chave: "pagina_entregue",     cor: COR.entregue },
          { rotulo: "Sem rastreio",      valor: pagina.sem_rastreio, chave: "sem_rastreio_pagina", cor: COR.rastreio },
        ]} />
        <LinhaProduto titulo="🎬 Vídeo" detalhe="up2 · ds2 · ds3" ativo={ativo} onClick={onClick} cards={[
          { rotulo: "Compraram",       valor: video.compraram,    chave: "video",              cor: COR.total },
          { rotulo: "Sem fotos",       valor: video.aguardando,   chave: "video_sem_fotos",    cor: COR.aguardando },
          { rotulo: "Em produção",     valor: video.producao,     chave: "video_producao",     cor: COR.producao },
          { rotulo: "Pendente envio",  valor: video.pendente,     chave: "video_pendentes",    cor: COR.pendente },
          { rotulo: "Entregue",        valor: video.entregue,     chave: "video_entregue",     cor: COR.entregue },
          { rotulo: "Erro de geração", valor: video.erro,         chave: "video_erro",         cor: COR.erro },
          { rotulo: "Sem rastreio",    valor: video.sem_rastreio, chave: "sem_rastreio_video", cor: COR.rastreio },
        ]} />
      </div>

      {/* Rastreio — por venda */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">Rastreio</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead><tr className="border-b border-gray-100">
              <th className={thNome}>Venda</th>
              <th className={th}>Vendas</th><th className={th}>Rastreadas</th><th className={th}>Sem rastreio</th><th className={th}>Receita</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {r.rastreio.map(x => (
                <tr key={x.oferta}>
                  <td className={nomeLinha}>{x.rotulo}</td>
                  <Num valor={x.vendas} chave={`venda_${x.oferta}`} ativo={ativo} onClick={onClick} />
                  <Num valor={x.rastreadas} tom="ok" ativo={ativo} onClick={onClick} />
                  <Num valor={x.sem_rastreio} chave={`sem_rastreio_${x.oferta}`} tom="pendencia" ativo={ativo} onClick={onClick} />
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-800">{usd(x.receita)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td className={`${nomeLinha} font-semibold`}>Total</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums font-semibold text-gray-800">{totalVendas.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums text-avocado-700">{totalRastreadas.toLocaleString("pt-BR")}</td>
                <td className={`px-3 py-2.5 text-right text-sm tabular-nums ${totalSemRastreio ? "font-semibold text-yellow-800" : "text-gray-300"}`}>{totalSemRastreio.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums font-semibold text-gray-800">{usd(receitaTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Etiqueta de oferta do funil (up1 / up2 / ds) com a cor do status
function Oferta({ label, status }: { label: string; status?: string | null }) {
  if (!status) return null;
  const cor =
    status === "pago"       ? "bg-avocado-100 text-avocado-700"
    : status === "recusado" ? "bg-gray-100 text-gray-400"
    : "bg-yellow-50 text-yellow-700";
  return <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${cor}`}>{label}</span>;
}

/* Card da lista — mesmo desenho do BR (app/dashboard/page.tsx): estado da
   música, selo do vídeo e "Entregue" à direita. As etiquetas up1/up2/ds são
   do funil ES. "Músicas extras" só aparece em pedido ANTIGO dos EUA (sem
   linha de vídeo): no ES o up2/ds é o vídeo, não mais as músicas 2 e 3. */
function PedidoCard({ p }: { p: PedidoEs }) {
  const gerada      = p.gerou_musica || !!p.link_audio || !!p.link_pagina;
  const alertaPago  = p.status === "pago" && !gerada;
  const naoEntregue = gerada && !p.entrega_email;
  const entregue    = !!p.entrega_email;

  // Pedido antigo (EUA): up2/combo eram as duas músicas extras, sem vídeo
  const extrasAntigas = !p.video && (p.up2_status === "pago" || p.ds_status === "pago");
  const extrasAbertas = extrasAntigas && !p.up_entrega_email;

  const cardClass = alertaPago
    ? "bg-red-50 border-red-200 hover:border-red-400"
    : naoEntregue || extrasAbertas
    ? "bg-yellow-50 border-yellow-200 hover:border-yellow-400"
    : "bg-white border-gray-200 hover:border-avocado-400";

  return (
    <Link
      href={`/dashboard/es/pedido/${p.id}`}
      className={`block rounded-xl border p-4 sm:p-5 hover:shadow-sm transition-all ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{p.nome || "(sem nome)"}</p>
          <p className="text-sm text-gray-500 truncate">{p.email?.split("?")[0]}</p>
          <p className="text-sm text-gray-500 mt-1">
            {p.plano && <span className="font-mono text-xs">{p.plano}</span>}
            {p.estilo && <span> · {p.estilo}</span>}
            {p.data_pedido && (
              <span> · {new Date(p.data_pedido).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            <Oferta label="up1" status={p.up1_status} />
            <Oferta label="up2" status={p.up2_status} />
            <Oferta label="ds"  status={p.ds_status} />
          </div>
          {alertaPago    && <p className="text-xs text-red-500 font-medium mt-1">Pago — música não gerada</p>}
          {naoEntregue   && <p className="text-xs text-yellow-600 font-medium mt-1">Música gerada — aguardando entrega</p>}
          {p.video && (() => { const e = estadoVideoEs(p.video); return (
            <p className="text-xs font-medium mt-1"><span className={`px-1.5 py-0.5 rounded ${e.cor}`}>🎬 Vídeo: {e.rotulo}</span></p>
          ); })()}
          {extrasAbertas && <p className="text-xs text-yellow-700 font-medium mt-1">Músicas extras (pedido antigo) — ainda não entregues</p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COR[p.status] ?? "bg-gray-100 text-gray-600"}`}>
            {p.status}
          </span>
          {entregue && <span className="text-xs text-avocado-600 font-medium">✓ Entregue</span>}
          {gerada && !entregue && <span className="text-xs text-gray-500">Música gerada</span>}
        </div>
      </div>
    </Link>
  );
}

function DashboardUsContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  // Busca
  const [busca, setBusca]           = useState(searchParams.get("q") ?? "");
  const [resultados, setResultados] = useState<PedidoEs[]>([]);
  const [carregandoBusca, setCarregandoBusca] = useState(false);
  const [erroBusca, setErroBusca]   = useState("");
  const [buscaFeita, setBuscaFeita] = useState(false);

  // Visão geral (entregas + rastreio), segue os filtros de data e plano
  const [resumo, setResumo] = useState<ResumoEs | null>(null);

  // Filtro (cards) — estado espelhado na URL
  const [filtroAtivo, setFiltroAtivo] = useState<string | null>(searchParams.get("view"));
  const [filtroData, setFiltroData]   = useState(searchParams.get("data") ?? "");
  const [filtroDesde, setFiltroDesde] = useState(searchParams.get("desde") ?? "");
  const [filtroAte, setFiltroAte]     = useState(searchParams.get("ate") ?? "");
  const [filtroPlano, setFiltroPlano] = useState(searchParams.get("plano") ?? "");
  const [planos, setPlanos]           = useState<string[]>([]);
  const [pedidosFiltro, setPedidosFiltro] = useState<PedidoEs[]>([]);
  const [paginaAtual, setPaginaAtual]     = useState(parseInt(searchParams.get("page") ?? "1"));
  const [totalPaginas, setTotalPaginas]   = useState(1);
  const [totalFiltro, setTotalFiltro]     = useState(0);
  const [carregandoFiltro, setCarregandoFiltro] = useState(false);

  const carregarFiltro = useCallback(async (
    filtro: string, pagina = 1, data = "", desde = "", ate = "", plano = "",
  ) => {
    setBuscaFeita(false);
    setCarregandoFiltro(true);
    setFiltroAtivo(filtro);
    setPaginaAtual(pagina);
    setFiltroData(data);
    setFiltroDesde(desde);
    setFiltroAte(ate);
    setFiltroPlano(plano);
    const params = new URLSearchParams({ view: filtro, page: String(pagina) });
    if (data)  params.set("data", data);
    if (desde) params.set("desde", desde);
    if (ate)   params.set("ate", ate);
    if (plano) params.set("plano", plano);
    router.replace(`/dashboard/es?${params.toString()}`);
    try {
      const apiParams = new URLSearchParams({ filtro, page: String(pagina) });
      if (data)  apiParams.set("data", data);
      if (desde) apiParams.set("desde", `${desde}:00-04:00`);
      if (ate)   apiParams.set("ate", `${ate}:00-04:00`);
      if (plano) apiParams.set("plano", plano);
      const res  = await fetch(`/api/es/pedidos?${apiParams.toString()}`);
      const json = await res.json();
      setPedidosFiltro(json.pedidos ?? []);
      setTotalPaginas(json.pages ?? 1);
      setTotalFiltro(json.total ?? 0);
    } finally {
      setCarregandoFiltro(false);
    }
  }, [router]);

  const executarBusca = useCallback(async (q: string) => {
    setFiltroAtivo(null);
    setFiltroData(""); setFiltroDesde(""); setFiltroAte(""); setFiltroPlano("");
    setCarregandoBusca(true);
    setErroBusca("");
    setResultados([]);
    setBuscaFeita(false);
    try {
      const res  = await fetch(`/api/es/search?${new URLSearchParams({ q })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na busca");
      setResultados(data);
      setBuscaFeita(true);
    } catch (e: any) {
      setErroBusca(e.message);
    } finally {
      setCarregandoBusca(false);
    }
  }, []);

  useEffect(() => {
    const q     = searchParams.get("q");
    const view  = searchParams.get("view");
    const page  = parseInt(searchParams.get("page") ?? "1");
    const data  = searchParams.get("data") ?? "";
    const desde = searchParams.get("desde") ?? "";
    const ate   = searchParams.get("ate") ?? "";
    const plano = searchParams.get("plano") ?? "";
    if (q) { setBusca(q); executarBusca(q); }
    if (view || plano) { carregarFiltro(view ?? "todos", page, data, desde, ate, plano); }
  }, []);

  // Planos apenas quando a sessão confirmar admin
  useEffect(() => {
    if (isAdmin) fetch("/api/es/planos").then(r => r.json()).then(setPlanos).catch(() => {});
  }, [isAdmin]);

  // Visão geral: recarrega quando muda o período ou o plano (mesmo formato da lista)
  useEffect(() => {
    if (!isAdmin) return;
    const p = new URLSearchParams();
    if (filtroData)  p.set("data", filtroData);
    if (filtroDesde) p.set("desde", `${filtroDesde}:00-04:00`);
    if (filtroAte)   p.set("ate", `${filtroAte}:00-04:00`);
    if (filtroPlano) p.set("plano", filtroPlano);
    fetch(`/api/es/resumo?${p.toString()}`).then(r => (r.ok ? r.json() : null)).then(setResumo).catch(() => {});
  }, [isAdmin, filtroData, filtroDesde, filtroAte, filtroPlano]);

  function handleCardClick(filtro: string) {
    if (filtroAtivo === filtro && !filtroData && !filtroDesde && !filtroAte && !filtroPlano) {
      setFiltroAtivo(null);
      router.replace("/dashboard/es");
    } else {
      carregarFiltro(filtro, 1, filtroData, filtroDesde, filtroAte, filtroPlano);
    }
  }

  function handleDataChange(nova: string) {
    carregarFiltro(filtroAtivo ?? "todos", 1, nova, "", "", filtroPlano);
  }
  function handleDesdeChange(novo: string) {
    carregarFiltro(filtroAtivo ?? "todos", 1, "", novo, filtroAte, filtroPlano);
  }
  function handleAteChange(novo: string) {
    carregarFiltro(filtroAtivo ?? "todos", 1, "", filtroDesde, novo, filtroPlano);
  }
  function limparFiltroData() {
    if (filtroAtivo || filtroPlano) {
      carregarFiltro(filtroAtivo ?? "todos", 1, "", "", "", filtroPlano);
    } else {
      setFiltroData(""); setFiltroDesde(""); setFiltroAte("");
      router.replace("/dashboard/es");
    }
  }
  function handlePlanoClick(plano: string) {
    const novo = filtroPlano === plano ? "" : plano;
    carregarFiltro(filtroAtivo ?? "todos", 1, filtroData, filtroDesde, filtroAte, novo);
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!busca.trim()) return;
    router.replace(`/dashboard/es?q=${encodeURIComponent(busca.trim())}`);
    executarBusca(busca.trim());
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900">abcMusic</h1>
          <p className="text-xs text-gray-500 truncate">Olá, {session?.user?.name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isAdmin && (
            <Link href="/dashboard/recuperacao" className="text-sm text-gray-500 hover:text-gray-700">Recuperação</Link>
          )}
          <SeletorPais />
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-gray-500 hover:text-gray-700">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Visão geral — apenas admin */}
        {isAdmin && resumo && <VisaoGeralEs r={resumo} ativo={filtroAtivo} onClick={handleCardClick} />}

        {/* Busca */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Buscar pedido</h2>
          <form onSubmit={handleBuscar} className="flex gap-2">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Email do cliente ou ID do pedido"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avocado-500"
            />
            <button
              type="submit"
              disabled={carregandoBusca || !busca.trim()}
              className="bg-avocado-600 hover:bg-avocado-700 disabled:opacity-50 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors"
            >
              {carregandoBusca ? "Buscando..." : "Buscar"}
            </button>
          </form>
          {erroBusca && <p className="mt-3 text-red-600 text-sm">{erroBusca}</p>}
        </div>

        {/* Resultados busca */}
        {buscaFeita && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{resultados.length} pedido(s) encontrado(s)</p>
              <button
                onClick={() => { setBuscaFeita(false); setBusca(""); router.replace("/dashboard/es"); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                ✕ limpar busca
              </button>
            </div>
            {resultados.length === 0
              ? <p className="text-center text-gray-500 py-8">Nenhum pedido encontrado.</p>
              : resultados.map(p => <PedidoCard key={p.id} p={p} />)
            }
          </div>
        )}

        {/* Filtros e lista — apenas admin, ocultos durante busca */}
        {isAdmin && !buscaFeita && <>

        {/* Filtro por data */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filtrar por data</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Dia exato</label>
              <input type="date" value={filtroData} onChange={(e) => handleDataChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avocado-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">De</label>
              <input type="datetime-local" value={filtroDesde} onChange={(e) => handleDesdeChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avocado-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Até</label>
              <input type="datetime-local" value={filtroAte} onChange={(e) => handleAteChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avocado-500" />
            </div>
          </div>
          {(filtroData || filtroDesde || filtroAte) && (
            <div className="flex items-center justify-end mt-3">
              <button onClick={limparFiltroData}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">
                ✕ limpar
              </button>
            </div>
          )}
        </div>

        {/* Filtro por plano */}
        {planos.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filtrar por plano</p>
            <div className="flex flex-wrap gap-2">
              {planos.map((p) => (
                <button key={p} onClick={() => handlePlanoClick(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-mono border transition-all ${
                    filtroPlano === p
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                  }`}>
                  {p}
                </button>
              ))}
              {filtroPlano && (
                <button onClick={() => handlePlanoClick(filtroPlano)}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-400 transition-all">
                  ✕ limpar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lista filtrada pelo card */}
        {(filtroAtivo || filtroData || filtroDesde || filtroAte || filtroPlano) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {filtroAtivo ? (FILTRO_LABEL[filtroAtivo] ?? ROTULO_FILTRO_ES[filtroAtivo] ?? filtroAtivo) : "Todos os pedidos"}
                  {filtroPlano && <span className="ml-2 font-mono text-xs text-gray-500">— {filtroPlano}</span>}
                </p>
                {!carregandoFiltro && (
                  <p className="text-xs text-gray-500">
                    {totalFiltro.toLocaleString("pt-BR")} pedido(s) · página {paginaAtual} de {totalPaginas}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setFiltroAtivo(null); setFiltroData(""); setFiltroDesde(""); setFiltroAte(""); setFiltroPlano("");
                  router.replace("/dashboard/es");
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ✕ fechar
              </button>
            </div>

            {carregandoFiltro ? (
              <p className="text-center text-gray-500 py-8">Carregando...</p>
            ) : (
              <>
                <div className="space-y-3">
                  {pedidosFiltro.length === 0
                    ? <p className="text-center text-gray-500 py-8">Nenhum pedido.</p>
                    : pedidosFiltro.map(p => <PedidoCard key={p.id} p={p} />)
                  }
                </div>

                {/* Paginação */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                      disabled={paginaAtual === 1}
                      onClick={() => carregarFiltro(filtroAtivo ?? "todos", paginaAtual - 1, filtroData, filtroDesde, filtroAte, filtroPlano)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      ← Anterior
                    </button>
                    <span className="text-sm text-gray-500">{paginaAtual} / {totalPaginas}</span>
                    <button
                      disabled={paginaAtual === totalPaginas}
                      onClick={() => carregarFiltro(filtroAtivo ?? "todos", paginaAtual + 1, filtroData, filtroDesde, filtroAte, filtroPlano)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      Próxima →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        </>}
      </main>
    </div>
  );
}

export default function DashboardUsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Carregando...</p></div>}>
      <DashboardUsContent />
    </Suspense>
  );
}
