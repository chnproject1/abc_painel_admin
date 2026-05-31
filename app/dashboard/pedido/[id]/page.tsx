"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";

interface Pedido {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  plano: string;
  status: string;
  estilo?: string;
  letra?: string;
  gerou_musica: boolean;
  link_pagina?: string;
  link_basica?: string;
  link_audio?: string;
  song_id?: string;
  data_entrega?: string;
  entrega_whatsapp: boolean;
  entrega_email: boolean;
  link_mp4?: string;
  valor?: string;
  data_pedido?: string;
}

interface Toast {
  tipo: "ok" | "erro";
  texto: string;
}

const STATUS_COR: Record<string, string> = {
  pendente:    "bg-gray-100 text-gray-600",
  pago:        "bg-green-100 text-green-700",
  concluido:   "bg-green-100 text-green-700",
  cancelado:   "bg-red-100 text-red-700",
  processando: "bg-blue-100 text-blue-700",
};

export default function PedidoPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();

  const [pedido, setPedido] = useState<Pedido | null>(null);

  // Letra / estilo
  const [letra, setLetra]         = useState("");
  const [estilo, setEstilo]       = useState("");
  const [letraSalva, setLetraSalva]   = useState("");
  const [estiloSalvo, setEstiloSalvo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const temAlteracao = letra !== letraSalva || estilo !== estiloSalvo;

  // Normalização
  const [normalizando, setNormalizando] = useState(false);
  const [resultadoNorm, setResultadoNorm] = useState<{ emails: number; telefones: number; nomes: number } | null>(null);

  const [acionando, setAcionando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const role = (session?.user as any)?.role ?? "OPERADOR";
  const isAdmin = role === "ADMIN";

  function mostrarToast(tipo: "ok" | "erro", texto: string) {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    fetch(`/api/pedido/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setPedido(data);
        setLetra(data.letra ?? "");
        setEstilo(data.estilo ?? "");
        setLetraSalva(data.letra ?? "");
        setEstiloSalvo(data.estilo ?? "");
      });
  }, [id]);

  async function salvarLetra() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/pedido/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letra, estilo }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setLetraSalva(letra);
      setEstiloSalvo(estilo);
      mostrarToast("ok", "Alterações salvas!");
    } catch {
      mostrarToast("erro", "Erro ao salvar a letra.");
    } finally {
      setSalvando(false);
    }
  }

  async function normalizarDados() {
    setNormalizando(true);
    setResultadoNorm(null);
    try {
      const res  = await fetch("/api/admin/normalizar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResultadoNorm(data.atualizados);
      mostrarToast("ok", "Dados normalizados com sucesso!");
    } catch (e: any) {
      mostrarToast("erro", e.message || "Erro ao normalizar.");
    } finally {
      setNormalizando(false);
    }
  }

  async function cancelarPedido() {
    if (!confirm("Marcar como contato inválido? O pedido sairá das listas de pendentes e erros.")) return;
    setCancelando(true);
    try {
      const res = await fetch(`/api/pedido/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelado" }),
      });
      if (!res.ok) throw new Error("Erro ao cancelar");
      setPedido(prev => prev ? { ...prev, status: "cancelado" } : prev);
      mostrarToast("ok", "Pedido marcado como contato inválido.");
    } catch {
      mostrarToast("erro", "Erro ao atualizar o pedido.");
    } finally {
      setCancelando(false);
    }
  }

  async function acionarEnvio() {
    setEnviando(true);
    try {
      const res = await fetch(`/api/trigger-envio/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao acionar envio");
      mostrarToast("ok", "Música enviada ao cliente!");
    } catch (e: any) {
      mostrarToast("erro", e.message || "Erro ao enviar música.");
    } finally {
      setEnviando(false);
    }
  }

  async function acionarN8n() {
    setAcionando(true);
    try {
      // Salva alterações pendentes antes de enviar
      if (temAlteracao) {
        const resSalvar = await fetch(`/api/pedido/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ letra, estilo }),
        });
        if (!resSalvar.ok) throw new Error("Erro ao salvar alterações antes de enviar");
        setLetraSalva(letra);
        setEstiloSalvo(estilo);
      }
      const res = await fetch(`/api/trigger/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao acionar");
      mostrarToast("ok", "Pedido enviado para produção!");
    } catch (e: any) {
      mostrarToast("erro", e.message || "Erro ao atualizar música.");
    } finally {
      setAcionando(false);
    }
  }

  if (!pedido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  const musicaGerada = pedido.gerou_musica || !!pedido.link_audio || !!pedido.link_pagina;
  const entregue = pedido.entrega_whatsapp || pedido.entrega_email;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.tipo === "ok" ? "bg-avocado-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.tipo === "ok" ? "✓" : "✕"} {toast.texto}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-800 font-medium shrink-0"
        >
          ← Voltar
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <h1 className="text-base font-bold text-gray-900 truncate">{pedido.nome}</h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COR[pedido.status] ?? "bg-gray-100 text-gray-600"}`}>
            {pedido.status}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Barra de status rápido */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap gap-4 sm:gap-8">
          <StatusIndicator
            label="Música gerada"
            ativo={musicaGerada}
            corAtivo="text-green-600"
            corInativo="text-red-500"
          />
          <StatusIndicator
            label="WhatsApp"
            ativo={pedido.entrega_whatsapp}
            corAtivo="text-green-600"
            corInativo="text-yellow-600"
            labelAtivo="Entregue"
            labelInativo="Não entregue"
          />
          <StatusIndicator
            label="E-mail"
            ativo={pedido.entrega_email}
            corAtivo="text-green-600"
            corInativo="text-yellow-600"
            labelAtivo="Entregue"
            labelInativo="Não entregue"
          />
          {pedido.data_pedido && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">Data do pedido</span>
              <span className="text-sm font-medium text-gray-700">
                {new Date(pedido.data_pedido).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
          )}
          {isAdmin && pedido.status !== "cancelado" && (
            <div className="ml-auto flex items-center">
              <button
                onClick={cancelarPedido}
                disabled={cancelando}
                className="text-xs border border-red-200 text-red-400 hover:bg-red-50 hover:border-red-400 hover:text-red-600 disabled:opacity-50 font-medium rounded-lg px-3 py-1.5 transition-colors"
              >
                {cancelando ? "..." : "Contato inválido"}
              </button>
            </div>
          )}
        </div>

        {/* Grid: Cliente + Pedido */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Cliente */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cliente</h2>
              {isAdmin && (
                <button
                  onClick={normalizarDados}
                  disabled={normalizando}
                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-md px-2 py-1 disabled:opacity-40 transition-colors"
                >
                  {normalizando ? "..." : "Normalizar"}
                </button>
              )}
            </div>
            <div className="space-y-3">
              <Campo label="Nome" valor={pedido.nome} />
              <Campo label="Telefone" valor={pedido.telefone} />
              <Campo label="E-mail" valor={pedido.email?.split("?")[0]} />
            </div>
            {resultadoNorm && (
              <p className="text-xs text-green-600 font-medium mt-3">
                ✓ {resultadoNorm.emails} e-mails · {resultadoNorm.telefones} telefones · {resultadoNorm.nomes} nomes
              </p>
            )}
          </section>

          {/* Pedido */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Pedido</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Plano" valor={pedido.plano} capitalize />
                <Campo label="Estilo" valor={pedido.estilo} />
              </div>
              {isAdmin && (
                <div className="grid grid-cols-2 gap-3">
                  {pedido.valor && (
                    <Campo label="Valor" valor={`R$ ${Number(pedido.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                  )}
                  {pedido.data_entrega && (
                    <Campo label="Data entrega" valor={new Date(pedido.data_entrega).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
                  )}
                </div>
              )}
              <Campo label="Song ID" valor={pedido.song_id} mono />
            </div>
          </section>
        </div>

        {/* Links */}
        {(pedido.link_pagina || pedido.link_basica || pedido.link_audio || pedido.link_mp4) && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Links</h2>
            <div className="flex flex-wrap gap-2">
              {pedido.link_pagina && (
                <LinkBtn href={pedido.link_pagina} label="🔗 Página Premium" />
              )}
              {pedido.link_basica && (
                <LinkBtn href={pedido.link_basica} label="🔗 Página Básica" />
              )}
              {pedido.link_audio && (
                <LinkBtn href={pedido.link_audio} label="🎵 Áudio" download />
              )}
              {pedido.link_mp4 && (
                <LinkBtn href={pedido.link_mp4} label="🎬 MP4" />
              )}
            </div>
          </section>
        )}

        {/* Letra e Estilo */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Letra e Estilo</h2>
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Estilo musical</label>
            <input
              type="text"
              value={estilo}
              onChange={(e) => setEstilo(e.target.value)}
              placeholder="Ex: Gospel, Sertanejo, Funk..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avocado-500"
            />
          </div>
          <label className="block text-xs text-gray-400 mb-1">Letra</label>
          <textarea
            value={letra}
            onChange={(e) => setLetra(e.target.value)}
            rows={14}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-avocado-500 resize-y"
          />
          <button
            onClick={salvarLetra}
            disabled={salvando || !temAlteracao}
            className={`mt-3 font-medium rounded-lg px-5 py-2 text-sm transition-all disabled:opacity-40 ${
              temAlteracao
                ? "bg-avocado-600 hover:bg-avocado-700 text-white shadow-sm"
                : "bg-gray-200 text-gray-500 cursor-default"
            }`}
          >
            {salvando ? "Salvando..." : temAlteracao ? "Salvar alterações ●" : "Salvar alterações"}
          </button>
        </section>

        {/* Ações */}
        <section className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {/* Enviar ao cliente */}
          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Enviar ao cliente</p>
              <p className="text-xs text-gray-400 mt-0.5">Envia a música já gerada por WhatsApp e e-mail.</p>
            </div>
            <button
              onClick={acionarEnvio}
              disabled={enviando}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors"
            >
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </div>
          {/* Gerar música */}
          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Gerar música</p>
              <p className="text-xs text-gray-400 mt-0.5">Reenvia para produção e atualiza a música do cliente.</p>
            </div>
            <button
              onClick={acionarN8n}
              disabled={acionando}
              className="shrink-0 bg-avocado-600 hover:bg-avocado-700 disabled:opacity-50 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors"
            >
              {acionando ? "Gerando..." : "Gerar e enviar"}
            </button>
          </div>
        </section>


      </main>
    </div>
  );
}

/* ── Sub-componentes ── */

function StatusIndicator({
  label, ativo, corAtivo, corInativo,
  labelAtivo = "Sim", labelInativo = "Não",
}: {
  label: string;
  ativo: boolean;
  corAtivo: string;
  corInativo: string;
  labelAtivo?: string;
  labelInativo?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm font-semibold flex items-center gap-1 ${ativo ? corAtivo : corInativo}`}>
        {ativo ? "✓" : "✕"} {ativo ? labelAtivo : labelInativo}
      </span>
    </div>
  );
}

function Campo({
  label, valor, capitalize, mono,
}: {
  label: string;
  valor?: string | null;
  capitalize?: boolean;
  mono?: boolean;
}) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium text-gray-800 break-words ${capitalize ? "capitalize" : ""} ${mono ? "font-mono text-xs" : ""}`}>
        {valor}
      </p>
    </div>
  );
}

function LinkBtn({ href, label, download }: { href: string; label: string; download?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      {...(download ? { download: true } : {})}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors font-medium"
    >
      {label}
    </a>
  );
}
