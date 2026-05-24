"use client";
import { useState, useEffect, Suspense } from "react";
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
  entrega_whatsapp?: boolean;
  entrega_email?: boolean;
}

const STATUS_COR: Record<string, string> = {
  pendente:    "bg-gray-100 text-gray-500",
  pago:        "bg-green-100 text-green-700",
  concluido:   "bg-green-100 text-green-700",
  cancelado:   "bg-red-100 text-red-700",
  processando: "bg-blue-100 text-blue-700",
};

function musicaGerada(p: Pedido) {
  return p.gerou_musica || !!p.link_audio || !!p.link_pagina;
}

function DashboardContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busca, setBusca] = useState(searchParams.get("q") ?? "");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [buscaFeita, setBuscaFeita] = useState(false);

  // Ao voltar da página de detalhe, reexecuta a busca se havia query na URL
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setBusca(q);
      executarBusca(q);
    }
  }, []);

  async function executarBusca(q: string) {
    setCarregando(true);
    setErro("");
    setPedidos([]);
    setBuscaFeita(false);

    try {
      const params = new URLSearchParams({ q });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na busca");
      setPedidos(data);
      setBuscaFeita(true);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
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
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sair
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
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
              disabled={carregando || !busca.trim()}
              className="bg-avocado-600 hover:bg-avocado-700 disabled:opacity-50 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors"
            >
              {carregando ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {erro && <p className="mt-3 text-red-600 text-sm">{erro}</p>}
        </div>

        {buscaFeita && (
          <div>
            {pedidos.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Nenhum pedido encontrado.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{pedidos.length} pedido(s) encontrado(s)</p>
                {pedidos.map((p) => {
                  const gerada = musicaGerada(p);
                  const naoEntregue = gerada && !p.entrega_whatsapp && !p.entrega_email;
                  const alertaPago = p.status === "pago" && !gerada;

                  const cardClass = alertaPago
                    ? "bg-red-50 border-red-200 hover:border-red-400"
                    : naoEntregue
                    ? "bg-yellow-50 border-yellow-200 hover:border-yellow-400"
                    : "bg-white border-gray-200 hover:border-avocado-400";

                  return (
                    <Link
                      key={p.id}
                      href={`/dashboard/pedido/${p.id}`}
                      className={`block rounded-xl border p-4 hover:shadow-sm transition-all ${cardClass}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{p.nome}</p>
                          <p className="text-sm text-gray-500">{p.telefone} · {p.email}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {p.plano && <span className="capitalize">{p.plano}</span>}
                            {p.estilo && <span> · {p.estilo}</span>}
                          </p>
                          {alertaPago && (
                            <p className="text-xs text-red-500 font-medium mt-1">Pago — música não gerada</p>
                          )}
                          {naoEntregue && (
                            <p className="text-xs text-yellow-600 font-medium mt-1">Música gerada — aguardando entrega</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COR[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {p.status}
                          </span>
                          {gerada && (
                            <span className="text-xs text-avocado-600 font-medium">Música gerada</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
