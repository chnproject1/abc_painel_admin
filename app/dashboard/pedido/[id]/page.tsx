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

export default function PedidoPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [letra, setLetra] = useState("");
  const [estilo, setEstilo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [acionando, setAcionando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const role = (session?.user as any)?.role ?? "OPERADOR";
  const isAdmin = role === "ADMIN";
  const isProdutor = role === "PRODUTOR";

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
      mostrarToast("ok", "Letra salva com sucesso!");
    } catch {
      mostrarToast("erro", "Erro ao salvar a letra.");
    } finally {
      setSalvando(false);
    }
  }

  async function acionarN8n() {
    setAcionando(true);
    try {
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast flutuante */}
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.tipo === "ok"
            ? "bg-avocado-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {toast.tipo === "ok" ? "✓" : "✕"} {toast.texto}
        </div>
      )}

      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-avocado-600 hover:text-avocado-800 text-sm font-medium">
          ← Voltar
        </button>
        <h1 className="text-base font-bold text-gray-900 truncate">{pedido.nome}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Informações</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <InfoItem label="Nome" value={pedido.nome} />
            <InfoItem label="Telefone" value={pedido.telefone} />
            <InfoItem label="Email" value={pedido.email} />
            <InfoItem label="Plano" value={pedido.plano} />
            <InfoItem label="Status" value={pedido.status} />
            <InfoItem label="Song ID" value={pedido.song_id} />
            <InfoItem label="Gerou música" value={(pedido.gerou_musica || !!pedido.link_audio || !!pedido.link_pagina) ? "Sim" : "Não"} />
            <InfoItem label="Entrega WhatsApp" value={pedido.entrega_whatsapp ? "Sim" : "Não"} />
            <InfoItem label="Entrega Email" value={pedido.entrega_email ? "Sim" : "Não"} />
            {pedido.data_entrega && (
              <InfoItem label="Data entrega" value={new Date(pedido.data_entrega).toLocaleDateString("pt-BR")} />
            )}
            {isAdmin && pedido.valor && (
              <InfoItem label="Valor" value={`R$ ${Number(pedido.valor).toFixed(2)}`} />
            )}
            {isAdmin && pedido.data_pedido && (
              <InfoItem label="Data pedido" value={new Date(pedido.data_pedido).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
            )}
          </dl>
        </section>

        {(pedido.link_pagina || pedido.link_basica || pedido.link_audio || pedido.link_mp4) && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Links</h2>
            <div className="space-y-2 text-sm">
              {pedido.link_pagina && <LinkItem label="Link Página" href={pedido.link_pagina} />}
              {pedido.link_basica && <LinkItem label="Link Básico" href={pedido.link_basica} />}
              {pedido.link_audio && <LinkItem label="Link Áudio" href={pedido.link_audio} />}
              {pedido.link_mp4 && <LinkItem label="Link MP4" href={pedido.link_mp4} />}
            </div>
          </section>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Letra e Estilo</h2>
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
            rows={12}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-avocado-500 resize-y"
          />
          <button
            onClick={salvarLetra}
            disabled={salvando}
            className="mt-3 bg-avocado-600 hover:bg-avocado-700 disabled:opacity-50 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-3">Reenvia o pedido para produção e atualiza a música do cliente.</p>
          <button
            onClick={acionarN8n}
            disabled={acionando}
            className="bg-avocado-600 hover:bg-avocado-700 disabled:opacity-50 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors"
          >
            {acionando ? "Enviando..." : "Enviar para produção"}
          </button>
        </section>

      </main>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-gray-400 text-xs">{label}</dt>
      <dd className="text-gray-900 font-medium mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function LinkItem({ label, href }: { label: string; href: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 w-24 shrink-0">{label}:</span>
      <a href={href} target="_blank" rel="noreferrer" className="text-avocado-600 hover:underline truncate">
        {href}
      </a>
    </div>
  );
}