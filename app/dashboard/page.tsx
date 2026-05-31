"use client";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Pedido {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  plano: string;
  status: string;
  estilo?: string;
  gerou_musica: boolean;
  link_audio?: string;
  link_pagina?: string;
  data_entrega?: string;
  data_pedido?: string;
  entrega_whatsapp?: boolean;
  entrega_email?: boolean;
}

interface Stats {
  total: number;
  pagos: number;
  pendentes_envio: number;
  erro_geracao: number;
}

const STATUS_COR: Record<string, string> = {
  pendente:    "bg-gray-100 text-gray-500",
  pago:        "bg-green-100 text-green-700",
  concluido:   "bg-green-100 text-green-700",
  cancelado:   "bg-red-100 text-red-700",
  processando: "bg-blue-100 text-blue-700",
};

const FILTRO_LABEL: Record<string, string> = {
  todos:     "Todos os pedidos",
  pagos:     "Compraram",
  pendentes: "Pendentes envio",
  erro:      "Erro de geração",
};

function StatCard({
  label, value, cor, ativo, onClick,
}: {
  label: string;
  value: number;
  cor: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 sm:p-5 flex flex-col gap-1 text-left w-full transition-all hover:opacity-90 ${cor} ${
        ativo ? "ring-2 ring-offset-2 ring-current shadow-md" : "hover:shadow-sm"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-70 leading-tight">{label}</p>
      <p className="text-3xl sm:text-4xl font-bold tabular-nums">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs opacity-50 mt-1">ver lista →</p>
    </button>
  );
}

function PedidoCard({ p }: { p: Pedido }) {
  const gerada = p.gerou_musica || !!p.link_audio || !!p.link_pagina;
  const naoEntregue = gerada && !p.entrega_whatsapp && !p.entrega_email;
  const alertaPago  = p.status === "pago" && !gerada;
  const entregue    = p.entrega_whatsapp || p.entrega_email;

  const cardClass = alertaPago
    ? "bg-red-50 border-red-200 hover:border-red-400"
    : naoEntregue
    ? "bg-yellow-50 border-yellow-200 hover:border-yellow-400"
    : "bg-white border-gray-200 hover:border-avocado-400";

  return (
    <Link
      href={`/dashboard/pedido/${p.id}`}
      className={`block rounded-xl border p-4 sm:p-5 hover:shadow-sm transition-all ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{p.nome || "(sem nome)"}</p>
          <p className="text-sm text-gray-500 truncate">{p.telefone} · {p.email?.split("?")[0]}</p>
          <p className="text-sm text-gray-500 mt-1">
            {p.plano && <span className="capitalize">{p.plano}</span>}
            {p.estilo && <span> · {p.estilo}</span>}
            {p.data_pedido && (
              <span> · {new Date(p.data_pedido).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
            )}
          </p>
          {alertaPago  && <p className="text-xs text-red-500 font-medium mt-1">Pago — música não gerada</p>}
          {naoEntregue && <p className="text-xs text-yellow-600 font-medium mt-1">Música gerada — aguardando entrega</p>}
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

function DashboardContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  // Busca
  const [busca, setBusca]           = useState(searchParams.get("q") ?? "");
  const [resultados, setResultados] = useState<Pedido[]>([]);
  const [carregandoBusca, setCarregandoBusca] = useState(false);
  const [erroBusca, setErroBusca]   = useState("");
  const [buscaFeita, setBuscaFeita] = useState(false);

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);

  // Filtro (cards) — estado espelhado na URL
  const [filtroAtivo, setFiltroAtivo]       = useState<string | null>(searchParams.get("view"));
  const [filtroData, setFiltroData]         = useState(searchParams.get("data") ?? "");
  const [filtroDesde, setFiltroDesde]       = useState(searchParams.get("desde") ?? "");
  const [filtroPlano, setFiltroPlano]       = useState(searchParams.get("plano") ?? "");
  const [planos, setPlanos]                 = useState<string[]>([]);
  const [pedidosFiltro, setPedidosFiltro]   = useState<Pedido[]>([]);
  const [paginaAtual, setPaginaAtual]       = useState(parseInt(searchParams.get("page") ?? "1"));
  const [totalPaginas, setTotalPaginas]     = useState(1);
  const [totalFiltro, setTotalFiltro]       = useState(0);
  const [carregandoFiltro, setCarregandoFiltro] = useState(false);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
    const q     = searchParams.get("q");
    const view  = searchParams.get("view");
    const page  = parseInt(searchParams.get("page") ?? "1");
    const data  = searchParams.get("data") ?? "";
    const desde = searchParams.get("desde") ?? "";
    const plano = searchParams.get("plano") ?? "";
    if (q)    { setBusca(q); executarBusca(q); }
    if (view || plano) { carregarFiltro(view ?? "todos", page, data, desde, plano); }
  }, []);

  // Busca planos apenas quando a sessão carregar e confirmar admin
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/planos").then(r => r.json()).then(setPlanos).catch(() => {});
    }
  }, [isAdmin]);

  async function executarBusca(q: string) {
    setFiltroAtivo(null);
    setFiltroData("");
    setFiltroDesde("");
    setFiltroPlano("");
    setCarregandoBusca(true);
    setErroBusca("");
    setResultados([]);
    setBuscaFeita(false);
    try {
      const res  = await fetch(`/api/search?${new URLSearchParams({ q })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na busca");
      setResultados(data);
      setBuscaFeita(true);
    } catch (e: any) {
      setErroBusca(e.message);
    } finally {
      setCarregandoBusca(false);
    }
  }

  const carregarFiltro = useCallback(async (filtro: string, pagina = 1, data = "", desde = "", plano = "") => {
    setBuscaFeita(false);
    setCarregandoFiltro(true);
    setFiltroAtivo(filtro);
    setPaginaAtual(pagina);
    setFiltroData(data);
    setFiltroDesde(desde);
    setFiltroPlano(plano);
    const params = new URLSearchParams({ view: filtro, page: String(pagina) });
    if (data)  params.set("data", data);
    if (desde) params.set("desde", desde);
    if (plano) params.set("plano", plano);
    router.replace(`/dashboard?${params.toString()}`);
    try {
      const apiParams = new URLSearchParams({ filtro, page: String(pagina) });
      if (data)  apiParams.set("data", data);
      if (desde) apiParams.set("desde", `${desde}:00-03:00`);
      if (plano) apiParams.set("plano", plano);
      const res  = await fetch(`/api/pedidos?${apiParams.toString()}`);
      const json = await res.json();
      setPedidosFiltro(json.pedidos);
      setTotalPaginas(json.pages);
      setTotalFiltro(json.total);
    } finally {
      setCarregandoFiltro(false);
    }
  }, []);

  function handleCardClick(filtro: string) {
    if (filtroAtivo === filtro && !filtroData && !filtroDesde && !filtroPlano) {
      setFiltroAtivo(null);
      router.replace("/dashboard");
    } else {
      carregarFiltro(filtro, 1, filtroData, filtroDesde, filtroPlano);
    }
  }

  function handleDataChange(novaData: string) {
    setFiltroData(novaData);
    setFiltroDesde("");
    carregarFiltro(filtroAtivo ?? "todos", 1, novaData, "", filtroPlano);
  }

  function handleDesdeChange(novoDesde: string) {
    setFiltroDesde(novoDesde);
    setFiltroData("");
    if (novoDesde) carregarFiltro(filtroAtivo ?? "todos", 1, "", novoDesde, filtroPlano);
  }

  function limparFiltroData() {
    setFiltroData("");
    setFiltroDesde("");
    if (filtroAtivo || filtroPlano) {
      carregarFiltro(filtroAtivo ?? "todos", 1, "", "", filtroPlano);
    } else {
      router.replace("/dashboard");
    }
  }

  function handlePlanoClick(plano: string) {
    const novo = filtroPlano === plano ? "" : plano;
    carregarFiltro(filtroAtivo ?? "todos", 1, filtroData, filtroDesde, novo);
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!busca.trim()) return;
    router.replace(`/dashboard?q=${encodeURIComponent(busca.trim())}`);
    executarBusca(busca.trim());
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">abcMusic</h1>
          <p className="text-xs text-gray-500">Olá, {session?.user?.name}</p>
        </div>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-gray-500 hover:text-gray-700">
          Sair
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Stats clicáveis */}
        {stats && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Visão geral</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Total"           value={stats.total}           cor="bg-white border-gray-200 text-gray-800"          ativo={filtroAtivo === "todos"}     onClick={() => handleCardClick("todos")} />
              <StatCard label="Pagas"           value={stats.pagos}           cor="bg-green-50 border-green-200 text-green-800"      ativo={filtroAtivo === "pagos"}     onClick={() => handleCardClick("pagos")} />
              <StatCard label="Pendentes envio" value={stats.pendentes_envio} cor="bg-yellow-50 border-yellow-200 text-yellow-800"   ativo={filtroAtivo === "pendentes"} onClick={() => handleCardClick("pendentes")} />
              <StatCard label="Erro de geração" value={stats.erro_geracao}    cor="bg-red-50 border-red-200 text-red-800"            ativo={filtroAtivo === "erro"}      onClick={() => handleCardClick("erro")} />
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
              placeholder="Telefone ou email do cliente"
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
                onClick={() => { setBuscaFeita(false); setBusca(""); router.replace("/dashboard"); }}
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

        {/* Filtros e lista — ocultos durante busca */}
        {!buscaFeita && <>

        {/* Filtro por data */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filtrar por data</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Dia exato</label>
              <input
                type="date"
                value={filtroData}
                onChange={(e) => handleDataChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avocado-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">A partir de (data e hora)</label>
              <input
                type="datetime-local"
                value={filtroDesde}
                onChange={(e) => handleDesdeChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avocado-500"
              />
            </div>
          </div>
          {(filtroData || filtroDesde) && (
            <div className="flex items-center justify-between mt-3">
              {filtroDesde ? (
                <p className="text-xs text-gray-500">
                  Exibindo a partir de{" "}
                  <span className="font-medium text-gray-700">
                    {new Date(`${filtroDesde}:00-03:00`).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Exibindo pedidos de{" "}
                  <span className="font-medium text-gray-700">
                    {new Date(`${filtroData}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                </p>
              )}
              <button
                onClick={limparFiltroData}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0 ml-3"
              >
                ✕ limpar
              </button>
            </div>
          )}
        </div>

        {/* Filtro por plano — só admin */}
        {isAdmin && planos.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filtrar por plano</p>
            <div className="flex flex-wrap gap-2">
              {planos.map((p) => (
                <button
                  key={p}
                  onClick={() => handlePlanoClick(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all capitalize ${
                    filtroPlano === p
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                  }`}
                >
                  {p}
                </button>
              ))}
              {filtroPlano && (
                <button
                  onClick={() => handlePlanoClick(filtroPlano)}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-400 transition-all"
                >
                  ✕ limpar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lista filtrada pelo card */}
        {(filtroAtivo || filtroData || filtroDesde || filtroPlano) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {filtroAtivo ? FILTRO_LABEL[filtroAtivo] : "Todos os pedidos"}
                  {filtroData && (
                    <span className="ml-2 font-normal text-gray-500">
                      — {new Date(`${filtroData}T12:00:00`).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  {filtroDesde && (
                    <span className="ml-2 font-normal text-gray-500">
                      — a partir de {new Date(`${filtroDesde}:00-03:00`).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {filtroPlano && (
                    <span className="ml-2 font-normal text-gray-500 capitalize">
                      — plano {filtroPlano}
                    </span>
                  )}
                </p>
                {!carregandoFiltro && (
                  <p className="text-xs text-gray-500">{totalFiltro.toLocaleString("pt-BR")} pedido(s) · página {paginaAtual} de {totalPaginas}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setFiltroAtivo(null);
                  setFiltroData("");
                  setFiltroDesde("");
                  setFiltroPlano("");
                  router.replace("/dashboard");
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
                      onClick={() => carregarFiltro(filtroAtivo ?? "todos", paginaAtual - 1, filtroData, filtroDesde, filtroPlano)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      ← Anterior
                    </button>
                    <span className="text-sm text-gray-500">
                      {paginaAtual} / {totalPaginas}
                    </span>
                    <button
                      disabled={paginaAtual === totalPaginas}
                      onClick={() => carregarFiltro(filtroAtivo ?? "todos", paginaAtual + 1, filtroData, filtroDesde, filtroPlano)}
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Carregando...</p></div>}>
      <DashboardContent />
    </Suspense>
  );
}
