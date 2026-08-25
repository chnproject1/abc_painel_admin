"use client";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SeletorPais from "@/components/SeletorPais";

interface PedidoUs {
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
}

interface Stats {
  total: number;
  pagos: number;
  up1: number;
  up2: number;
  ds: number;
  pendentes_envio: number;
  erro_geracao: number;
  pendentes_envio_up: number;
  erro_geracao_up: number;
  receita: { inicial: number; up1: number; up2: number; ds: number; total: number };
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
  pendentes:    "Entrega principal pendente",
  erro:         "Erro de geração (música 1)",
  up1:          "Compraram o upsell 1",
  up2:          "Compraram o upsell 2",
  ds:           "Compraram o downsell (página + músicas)",
  pendentes_up: "Músicas extras pendentes",
  erro_up:      "Erro de geração (músicas extras)",
};

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

function StatCard({
  label, value, cor, ativo, onClick,
}: {
  label: string; value: number; cor: string; ativo: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 flex flex-col gap-1 text-left w-full transition-all hover:opacity-90 ${cor} ${
        ativo ? "ring-2 ring-offset-2 ring-current shadow-md" : "hover:shadow-sm"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-70 leading-tight">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value.toLocaleString("en-US")}</p>
      <p className="text-xs opacity-50 mt-1">ver lista →</p>
    </button>
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

function PedidoCard({ p }: { p: PedidoUs }) {
  const gerada        = p.gerou_musica || !!p.link_audio || !!p.link_pagina;
  const alertaPago    = p.status === "pago" && !gerada;
  const naoEntregue   = gerada && !p.entrega_email;
  const temExtras     = p.up2_status === "pago" || p.ds_status === "pago";
  const extrasAbertas = temExtras && !p.up_entrega_email;

  const cardClass = alertaPago
    ? "bg-red-50 border-red-200 hover:border-red-400"
    : naoEntregue || extrasAbertas
    ? "bg-yellow-50 border-yellow-200 hover:border-yellow-400"
    : "bg-white border-gray-200 hover:border-avocado-400";

  return (
    <Link
      href={`/dashboard/us/pedido/${p.id}`}
      className={`block rounded-xl border p-4 sm:p-5 hover:shadow-sm transition-all ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{p.nome || "(no name)"}</p>
          <p className="text-sm text-gray-500 truncate">{p.email?.split("?")[0]}</p>
          <p className="text-sm text-gray-500 mt-1">
            {p.plano && <span className="font-mono text-xs">{p.plano}</span>}
            {p.estilo && <span> · {p.estilo}</span>}
            {p.data_pedido && (
              <span> · {new Date(p.data_pedido).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            <Oferta label="up1" status={p.up1_status} />
            <Oferta label="up2" status={p.up2_status} />
            <Oferta label="ds"  status={p.ds_status} />
          </div>
          {alertaPago    && <p className="text-xs text-red-500 font-medium mt-1">Pago — música não gerada</p>}
          {naoEntregue   && <p className="text-xs text-yellow-600 font-medium mt-1">Música gerada — aguardando entrega</p>}
          {extrasAbertas && <p className="text-xs text-yellow-700 font-medium mt-1">Músicas extras compradas — ainda não entregues</p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COR[p.status] ?? "bg-gray-100 text-gray-600"}`}>
            {p.status}
          </span>
          {p.entrega_email && <span className="text-xs text-avocado-600 font-medium">✓ Entregue</span>}
          {temExtras && p.up_entrega_email && (
            <span className="text-xs text-avocado-600 font-medium">✓ Extras entregues</span>
          )}
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
  const [resultados, setResultados] = useState<PedidoUs[]>([]);
  const [carregandoBusca, setCarregandoBusca] = useState(false);
  const [erroBusca, setErroBusca]   = useState("");
  const [buscaFeita, setBuscaFeita] = useState(false);

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);

  // Filtro (cards) — estado espelhado na URL
  const [filtroAtivo, setFiltroAtivo] = useState<string | null>(searchParams.get("view"));
  const [filtroData, setFiltroData]   = useState(searchParams.get("data") ?? "");
  const [filtroDesde, setFiltroDesde] = useState(searchParams.get("desde") ?? "");
  const [filtroAte, setFiltroAte]     = useState(searchParams.get("ate") ?? "");
  const [filtroPlano, setFiltroPlano] = useState(searchParams.get("plano") ?? "");
  const [planos, setPlanos]           = useState<string[]>([]);
  const [pedidosFiltro, setPedidosFiltro] = useState<PedidoUs[]>([]);
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
    router.replace(`/dashboard/us?${params.toString()}`);
    try {
      const apiParams = new URLSearchParams({ filtro, page: String(pagina) });
      if (data)  apiParams.set("data", data);
      if (desde) apiParams.set("desde", `${desde}:00-04:00`);
      if (ate)   apiParams.set("ate", `${ate}:00-04:00`);
      if (plano) apiParams.set("plano", plano);
      const res  = await fetch(`/api/us/pedidos?${apiParams.toString()}`);
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
      const res  = await fetch(`/api/us/search?${new URLSearchParams({ q })}`);
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

  // Stats e planos apenas quando a sessão confirmar admin
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/us/stats").then(r => r.json()).then(setStats).catch(() => {});
      fetch("/api/us/planos").then(r => r.json()).then(setPlanos).catch(() => {});
    }
  }, [isAdmin]);

  function handleCardClick(filtro: string) {
    if (filtroAtivo === filtro && !filtroData && !filtroDesde && !filtroAte && !filtroPlano) {
      setFiltroAtivo(null);
      router.replace("/dashboard/us");
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
      router.replace("/dashboard/us");
    }
  }
  function handlePlanoClick(plano: string) {
    const novo = filtroPlano === plano ? "" : plano;
    carregarFiltro(filtroAtivo ?? "todos", 1, filtroData, filtroDesde, filtroAte, novo);
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!busca.trim()) return;
    router.replace(`/dashboard/us?q=${encodeURIComponent(busca.trim())}`);
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
          <SeletorPais />
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-gray-500 hover:text-gray-700">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Stats clicáveis — apenas admin */}
        {isAdmin && stats && (
          <div className="mb-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Venda inicial</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <StatCard label="Total"            value={stats.total}           cor="bg-white border-gray-200 text-gray-800"         ativo={filtroAtivo === "todos"}     onClick={() => handleCardClick("todos")} />
                <StatCard label="Pagas"            value={stats.pagos}           cor="bg-green-50 border-green-200 text-green-800"     ativo={filtroAtivo === "pagos"}     onClick={() => handleCardClick("pagos")} />
                <StatCard label="Entrega pendente" value={stats.pendentes_envio} cor="bg-yellow-50 border-yellow-200 text-yellow-800"  ativo={filtroAtivo === "pendentes"} onClick={() => handleCardClick("pendentes")} />
                <StatCard label="Erro de geração"  value={stats.erro_geracao}    cor="bg-red-50 border-red-200 text-red-800"           ativo={filtroAtivo === "erro"}      onClick={() => handleCardClick("erro")} />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Funil de ofertas</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <StatCard label="Upsell 1 · página"  value={stats.up1} cor="bg-avocado-50 border-avocado-200 text-avocado-800" ativo={filtroAtivo === "up1"} onClick={() => handleCardClick("up1")} />
                <StatCard label="Upsell 2 · músicas" value={stats.up2} cor="bg-avocado-50 border-avocado-200 text-avocado-800" ativo={filtroAtivo === "up2"} onClick={() => handleCardClick("up2")} />
                <StatCard label="Downsell"           value={stats.ds}  cor="bg-blue-50 border-blue-200 text-blue-800"          ativo={filtroAtivo === "ds"}  onClick={() => handleCardClick("ds")} />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Músicas extras (upsell 2)</h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <StatCard label="Entrega pendente" value={stats.pendentes_envio_up} cor="bg-yellow-50 border-yellow-200 text-yellow-800" ativo={filtroAtivo === "pendentes_up"} onClick={() => handleCardClick("pendentes_up")} />
                <StatCard label="Erro de geração"  value={stats.erro_geracao_up}    cor="bg-red-50 border-red-200 text-red-800"          ativo={filtroAtivo === "erro_up"}      onClick={() => handleCardClick("erro_up")} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Faturamento</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><p className="text-xs text-gray-400">Venda inicial</p><p className="text-lg font-semibold text-gray-800 tabular-nums">{usd(stats.receita.inicial)}</p></div>
                <div><p className="text-xs text-gray-400">Upsell 1</p><p className="text-lg font-semibold text-gray-800 tabular-nums">{usd(stats.receita.up1)}</p></div>
                <div><p className="text-xs text-gray-400">Upsell 2</p><p className="text-lg font-semibold text-gray-800 tabular-nums">{usd(stats.receita.up2)}</p></div>
                <div><p className="text-xs text-gray-400">Downsell</p><p className="text-lg font-semibold text-gray-800 tabular-nums">{usd(stats.receita.ds)}</p></div>
              </div>
              <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">
                Total: <span className="font-semibold text-gray-800 tabular-nums">{usd(stats.receita.total)}</span>
              </p>
            </div>
          </div>
        )}

        {/* Busca */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Buscar pedido</h2>
          <form onSubmit={handleBuscar} className="flex gap-2">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Email do cliente ou ID do Stripe"
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
                onClick={() => { setBuscaFeita(false); setBusca(""); router.replace("/dashboard/us"); }}
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filtrar por data (fuso de Nova York)</p>
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
                  {filtroAtivo ? FILTRO_LABEL[filtroAtivo] : "Todos os pedidos"}
                  {filtroPlano && <span className="ml-2 font-mono text-xs text-gray-500">— {filtroPlano}</span>}
                </p>
                {!carregandoFiltro && (
                  <p className="text-xs text-gray-500">
                    {totalFiltro.toLocaleString("en-US")} pedido(s) · página {paginaAtual} de {totalPaginas}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setFiltroAtivo(null); setFiltroData(""); setFiltroDesde(""); setFiltroAte(""); setFiltroPlano("");
                  router.replace("/dashboard/us");
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
