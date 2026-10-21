"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { estadoVideo, PRODUCAO_LABEL, type VideoResumo } from "@/lib/video-estado";
import { bumpsMapa, estadoCanal, linhasEntregaBr, type Cor, type LinhaEntrega } from "@/lib/br-entregas";

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
  bumps?: string | null;          // order bumps do BR: "video:29.90,estilo:24.90,pagina:19.90"
  estilo2?: string | null;
  link_audio2?: string | null;
  link_pagina2?: string | null;
  song_id2?: string | null;
  bumps_enviados?: string | null;
  valor?: string;
  data_pedido?: string;
  rastreado?: boolean;
  video?: (VideoResumo & {
    token: string; valor?: number | null; opcoes?: { modelo?: string } | null; fotos_qtd: number; tentativas: number; rastreado?: boolean;
    enviado_em?: string | null; aberto_em?: string | null; link: string; video_url?: string | null;
  }) | null;
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
  const [enviando, setEnviando] = useState<string | null>(null);   // item em envio: "tudo" | "pagina" | …
  const [cancelando, setCancelando] = useState(false);
  const [refazendoVideo, setRefazendoVideo] = useState(false);
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

  /* item: "tudo" (botão Enviar, a música), "geral" (Envio geral) ou uma linha das Entregas. Só reenvia o que
     já foi gerado — nada vai de novo pra Suno nem pro render. */
  async function acionarEnvio(item = "tudo") {
    setEnviando(item);
    try {
      const res = await fetch(`/api/trigger-envio/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao acionar envio");
      mostrarToast("ok", `Enviado ao cliente: ${data.enviados.join(", ")}`);
      if (item === "criar_video") setTimeout(() => location.reload(), 1200);   // o quadro do vídeo aparece
    } catch (e: any) {
      mostrarToast("erro", e.message || "Erro ao enviar.");
    } finally {
      setEnviando(null);
    }
  }

  /* Devolve o vídeo pra fila de render. O estado local é atualizado na mão
     porque a página não refaz o fetch — sem isso o card continuaria vermelho
     e a atendente clicaria de novo. */
  async function refazerVideo() {
    if (!confirm("Mandar o vídeo de volta para a produção?")) return;
    setRefazendoVideo(true);
    try {
      const res = await fetch(`/api/trigger-video/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao refazer o vídeo");
      setPedido(prev => prev?.video
        ? { ...prev, video: { ...prev.video, producao: "fotos_enviadas", erro_msg: null, concluido_em: null, entrega_whatsapp: false, atualizado_em: new Date().toISOString() } }
        : prev);
      mostrarToast("ok", "Vídeo devolvido para a produção.");
    } catch (e: any) {
      mostrarToast("erro", e.message || "Erro ao refazer o vídeo.");
    } finally {
      setRefazendoVideo(false);
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

  // Order bumps (mesmo Pix), o envio de cada canal e a cor de cada linha — lib/br-entregas.ts
  const bumps = bumpsMapa(pedido.bumps);
  const estado = (item: string, canal: "whats" | "email") => estadoCanal(pedido.bumps_enviados, item, canal);
  const v = pedido.video;
  const videoLetra = v?.opcoes?.modelo === "letra";
  const linhas = linhasEntregaBr(pedido);
  const linha = (item: string) => linhas.find((l) => l.item === item);
  const dt = (d?: string | null) => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
  const real = (x?: string | number | null) => x != null && x !== "" ? `R$ ${Number(x).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null;

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
        {/* Direto pra visão geral: quem pula de pedido em pedido não precisa voltar várias vezes */}
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-gray-500 hover:text-gray-800 font-medium shrink-0"
        >
          ⌂ Início
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <h1 className="text-base font-bold text-gray-900 truncate">{pedido.nome}</h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COR[pedido.status] ?? "bg-gray-100 text-gray-600"}`}>
            {pedido.status}
          </span>
        </div>
        {isAdmin && pedido.status !== "cancelado" && (
          <button
            onClick={cancelarPedido}
            disabled={cancelando}
            className="text-xs border border-red-200 text-red-400 hover:bg-red-50 hover:border-red-400 hover:text-red-600 disabled:opacity-50 font-medium rounded-lg px-3 py-1.5 transition-colors shrink-0"
          >
            {cancelando ? "..." : "Contato inválido"}
          </button>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Atendimento: a barra de status de sempre. O admin vê o Funil e as Entregas (como no ES). */}
        {!isAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap gap-4 sm:gap-8">
            <StatusIndicator label="Música gerada" ativo={musicaGerada} corAtivo="text-green-600" corInativo="text-red-500" />
            <StatusIndicator label="WhatsApp" ativo={pedido.entrega_whatsapp} corAtivo="text-green-600" corInativo="text-yellow-600" labelAtivo="Entregue" labelInativo="Não entregue" />
            <StatusIndicator label="E-mail" ativo={pedido.entrega_email} corAtivo="text-green-600" corInativo="text-yellow-600" labelAtivo="Entregue" labelInativo="Não entregue" />
            {pedido.data_pedido && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400">Data do pedido</span>
                <span className="text-sm font-medium text-gray-700">{dt(pedido.data_pedido)}</span>
              </div>
            )}
          </div>
        )}

        {/* Funil de ofertas — a venda da frente (os bumps vêm no mesmo Pix) e o upsell de vídeo */}
        {isAdmin && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Funil de ofertas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <OfertaBox titulo="Venda inicial" descricao={`Música · ${pedido.plano}`} status={pedido.status} valor={real(pedido.valor)} rastreado={!!pedido.rastreado} />
              <OfertaBox titulo="Bump" descricao="Vídeo com letra" status={bumps.video ? pedido.status : null} valor={real(bumps.video)} />
              <OfertaBox titulo="Bump" descricao={`Estilo extra${pedido.estilo2 ? ` · ${pedido.estilo2}` : ""}`} status={bumps.estilo ? pedido.status : null} valor={real(bumps.estilo)} />
              <OfertaBox titulo="Bump" descricao="Página Premium" status={bumps.pagina ? pedido.status : null} valor={real(bumps.pagina)} />
              <OfertaBox titulo="Upsell" descricao="Vídeo com fotos" status={v && !videoLetra ? v.status : null} valor={v && !videoLetra ? real(v.valor) : null} rastreado={v && !videoLetra ? !!v.rastreado : undefined} />
            </div>
          </section>
        )}

        {/* Entregas — cor do estado pela regra de lib/br-entregas.ts (a mesma do início) */}
        {isAdmin && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Entregas</h2>
            <div className="divide-y divide-gray-100">
              <Entrega label="Música — venda inicial" linha={linha("musica")} quando={pedido.data_entrega} />
              <Entrega label="Página Premium — bump" linha={linha("pagina")} />
              <Entrega label="Estilo extra — bump" linha={linha("estilo")} />
              <Entrega label="Vídeo com letra — bump" linha={videoLetra || bumps.video ? linha("video") : undefined} quando={v?.concluido_em} />
              <Entrega label="Vídeo com fotos — upsell" linha={!videoLetra && !bumps.video ? linha("video") : undefined} quando={v?.concluido_em} />
            </div>
          </section>
        )}

        {/* Cliente + Pedido */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Pedido</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Plano" valor={pedido.plano} capitalize />
                <Campo label="Estilo" valor={pedido.estilo2 ? `${pedido.estilo ?? "—"} · extra: ${pedido.estilo2}` : pedido.estilo} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {isAdmin && <Campo label="Valor" valor={real(pedido.valor)} />}
                <Campo label="Entrega principal" valor={dt(pedido.data_entrega)} />
              </div>
              {(linha("pagina")?.quando || linha("estilo")?.quando) && (
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Entrega da Página Premium" valor={dt(linha("pagina")?.quando)} />
                  <Campo label="Entrega do estilo extra" valor={dt(linha("estilo")?.quando)} />
                </div>
              )}
              <Campo label="Data do pedido" valor={dt(pedido.data_pedido)} />
              <Campo label="ID do pedido" valor={pedido.id} mono />
            </div>
          </section>
        </div>

        {/* Músicas — um bloco por música */}
        <Musica
          titulo="Música 1 — venda inicial"
          nomeArquivo={pedido.nome}
          songId={pedido.song_id}
          linkPagina={pedido.link_pagina}
          linkBasica={pedido.link_basica}
          linkAudio={pedido.link_audio}
          linkMp4={pedido.link_mp4}
        />
        {bumps.estilo && (
          <Musica
            titulo={`Música 2 — estilo extra${pedido.estilo2 ? ` (${pedido.estilo2})` : ""}`}
            nomeArquivo={`${pedido.nome} ${pedido.estilo2 ?? ""}`.trim()}
            songId={pedido.song_id2 ?? undefined}
            linkPagina={pedido.link_pagina2 ?? undefined}
            linkAudio={pedido.link_audio2 ?? undefined}
          />
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

        {/* Ações — todos os botões aqui, no formato do ES */}
        <section className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <Acao
            titulo="Enviar música"
            descricao="Envia a música por WhatsApp e e-mail (o envio de sempre)."
            rotulo={enviando === "tudo" ? "Enviando..." : "Enviar"}
            cor="bg-blue-600 hover:bg-blue-700"
            disabled={!!enviando || acionando}
            onClick={() => acionarEnvio("tudo")}
          />
          {isAdmin && pedido.bumps && (
            <Acao
              titulo="Envio geral"
              descricao="Um e-mail só com a música e tudo o que já foi gerado do pedido (página, estilo extra, vídeo)."
              rotulo={enviando === "geral" ? "Enviando..." : "Enviar"}
              cor="bg-blue-600 hover:bg-blue-700"
              disabled={!!enviando || acionando}
              onClick={() => acionarEnvio("geral")}
            />
          )}
          <Acao
            titulo="Gerar música principal"
            descricao="Reenvia para produção e atualiza a música do cliente."
            rotulo={acionando ? "Gerando..." : "Gerar e enviar"}
            disabled={!!enviando || acionando}
            onClick={acionarN8n}
          />
        </section>

        {/* Bump do vídeo pago e o vídeo não foi criado (o Pix caiu e a criação falhou) — só admin */}
        {isAdmin && bumps.video && !v && pedido.status === "pago" && (
          <section className="rounded-xl border p-5 bg-red-50 border-red-200">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">🎬 Vídeo com letra — order bump</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Vídeo não criado</span>
            </div>
            <p className="text-sm text-red-700 mb-4">Pago no Pix da música ({real(bumps.video)}), mas o vídeo não foi criado. Criar agora manda o e-mail das fotos; sem fotos, sai sozinho em 2 h.</p>
            <button onClick={() => acionarEnvio("criar_video")} disabled={!!enviando}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {enviando === "criar_video" ? "Criando..." : "🎬 Criar vídeo"}
            </button>
          </section>
        )}

        {/* Vídeo — dois tipos: com letra (order bump, no Pix da música) ou só de fotos (upsell /upvideo).
            A atendente pega o link e o arquivo aqui; o detalhe da produção é do admin. */}
        {pedido.video && (() => {
          const v = pedido.video;
          const e = estadoVideo(v);
          const dt = (d?: string | Date | null) => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
          const valor = v.valor != null ? ` · R$ ${Number(v.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";
          return (
            <section className={`rounded-xl border p-5 ${e.chave === "erro" ? "bg-red-50 border-red-200" : e.chave === "pendente_envio" ? "bg-yellow-50 border-yellow-200" : "bg-white border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{videoLetra ? "🎬 Vídeo com letra — order bump" : "🎬 Vídeo com fotos — upsell"}</h2>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${e.cor}`}>{e.rotulo}</span>
              </div>
              <p className={`text-sm mb-4 ${e.chave === "erro" ? "text-red-700" : e.chave === "pendente_envio" ? "text-yellow-800" : "text-gray-600"}`}>{e.detalhe}</p>

              <div className={`grid grid-cols-2 gap-3 mb-4 ${isAdmin ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
                <Campo label="Venda" valor={v.status === "pago" ? `Pago${valor}${isAdmin ? (videoLetra ? " (order bump)" : " (upsell)") : ""}` : "Não pagou"} />
                <Campo label="Produção" valor={PRODUCAO_LABEL[v.producao] ?? v.producao} />
                <Campo label="Fotos" valor={v.fotos_qtd ? `${v.fotos_qtd} enviadas` : "nenhuma"} />
                <Campo label="Entrega WhatsApp" valor={v.entrega_whatsapp ? "✓ Enviado" : "✕ Não enviado"} />
                {isAdmin && <Campo label="Entrega e-mail" valor={estado("video", "email") === "ok" ? "✓ Enviado" : estado("video", "email") === "erro" ? "✕ Erro" : "—"} />}
              </div>
              {/* Rastreio e linha do tempo são diagnóstico de operação: não
                  ajudam quem está no atendimento e só competem por atenção
                  com o estado e os botões. Ficam só para o admin. */}
              {isAdmin && v.status === "pago" && !videoLetra && (
                <p className={`text-xs font-medium mb-4 ${v.rastreado ? "text-avocado-600" : "text-blue-700"}`}>
                  {v.rastreado ? "✓ Venda registrada na UTMify" : "Venda ainda não registrada na UTMify (sem rastreio)"}
                </p>
              )}
              {isAdmin && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Campo label={videoLetra ? "Pedido de fotos" : "Link enviado"} valor={dt(v.enviado_em) ?? "—"} />
                  <Campo label="Abriu o link" valor={dt(v.aberto_em) ?? "—"} />
                  <Campo label={videoLetra ? "Fotos em" : "Pago em"} valor={dt(videoLetra ? v.fotos_em : v.pago_em) ?? "—"} />
                  <Campo label="Concluído em" valor={dt(v.concluido_em) ?? "—"} />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {e.chave === "erro" && (
                  <button
                    onClick={refazerVideo}
                    disabled={refazendoVideo}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    {refazendoVideo ? "Enviando..." : "🔄 Mandar pra produção de novo"}
                  </button>
                )}
                {v.video_url && (
                  <a
                    href={`/api/download?url=${encodeURIComponent(v.video_url)}&filename=${encodeURIComponent(`video-${pedido.nome || "cliente"}.mp4`)}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-avocado-600 hover:bg-avocado-700 text-white text-sm font-medium transition-colors"
                  >
                    ⬇️ Baixar vídeo
                  </a>
                )}
                {v.video_url && <LinkBtn href={v.video_url} label="▶️ Ver vídeo" />}
                <LinkBtn href={v.link} label="🔗 Página do cliente" />
                {isAdmin && videoLetra && v.producao === "aguardando_fotos" && (
                  <button onClick={() => acionarEnvio("fotos")} disabled={!!enviando}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium transition-colors">
                    {enviando === "fotos" ? "Enviando..." : "📧 Reenviar pedido de fotos"}
                  </button>
                )}
              </div>
              {e.chave === "pendente_envio" && (
                <p className="text-xs text-yellow-800 mt-3">Baixe o vídeo e mande pro cliente no WhatsApp <span className="font-mono">{pedido.telefone}</span>.</p>
              )}
            </section>
          );
        })()}

      </main>
    </div>
  );
}

/* ── Sub-componentes ── */

function OfertaBox({
  titulo, descricao, status, valor, rastreado,
}: {
  titulo: string; descricao: string; status?: string | null; valor?: string | null;
  /** undefined = não mostra (o bump vai na venda da frente) */
  rastreado?: boolean;
}) {
  const cor =
    status === "pago"       ? "border-avocado-300 bg-avocado-50"
    : status === "recusado" ? "border-gray-200 bg-gray-50 opacity-60"
    : status                ? "border-yellow-200 bg-yellow-50"
    : "border-dashed border-gray-200 bg-white opacity-50";

  return (
    <div className={`rounded-lg border p-3 ${cor}`}>
      <p className="text-xs font-semibold text-gray-700">{titulo}</p>
      <p className="text-[11px] text-gray-500 mb-1.5">{descricao}</p>
      <p className="text-sm font-medium text-gray-800">{status ?? "não optado"}</p>
      {valor && <p className="text-xs text-gray-500 tabular-nums mt-0.5">{valor}</p>}
      {status === "pago" && rastreado !== undefined && (
        <p className={`text-[11px] font-medium mt-1.5 ${rastreado ? "text-avocado-600" : "text-blue-700"}`}>
          {rastreado ? "✓ UTMify" : "Sem rastreio"}
        </p>
      )}
    </div>
  );
}

/* Uma linha de Entregas, no desenho do ES; a cor vem de lib/br-entregas.ts:
     verde entregue · amarelo erro no envio / não enviado · vermelho pago e nada gerado · cinza em produção */
const COR_TEXTO: Record<Cor, string> = { verde: "text-green-600", amarelo: "text-yellow-600", vermelho: "text-red-600", cinza: "text-gray-500" };

function Entrega({ label, linha, quando }: { label: string; linha?: LinhaEntrega; quando?: string | Date | null }) {
  if (!linha) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <span className="text-sm text-gray-300">{label}</span>
        <span className="text-xs text-gray-300 shrink-0">não comprado</span>
      </div>
    );
  }
  // amarelo por erro: diz em qual canal
  const canais = [linha.whats === "erro" ? "WhatsApp" : null, linha.email === "erro" ? "e-mail" : null].filter(Boolean);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`text-sm font-medium shrink-0 text-right ${COR_TEXTO[linha.cor]}`}>
        {linha.texto}{canais.length ? ` (${canais.join(" e ")})` : ""}
        {linha.cor === "verde" && (quando ?? linha.quando) && (
          <span className="text-xs font-normal text-gray-400 ml-2">
            {new Date((quando ?? linha.quando)!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </span>
    </div>
  );
}

function Acao({
  titulo, descricao, rotulo, disabled, onClick, cor = "bg-avocado-600 hover:bg-avocado-700",
}: {
  titulo: string; descricao: string; rotulo: string; disabled: boolean;
  onClick: () => void; cor?: string;
}) {
  return (
    <div className="p-5 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-700">{titulo}</p>
        <p className="text-xs text-gray-400 mt-0.5">{descricao}</p>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`shrink-0 ${cor} disabled:opacity-50 text-white font-medium rounded-lg px-5 py-2 text-sm transition-colors`}
      >
        {rotulo}
      </button>
    </div>
  );
}

function Musica({
  titulo, nomeArquivo, songId, linkPagina, linkBasica, linkAudio, linkMp4,
}: {
  titulo: string; nomeArquivo: string; songId?: string;
  linkPagina?: string; linkBasica?: string; linkAudio?: string; linkMp4?: string;
}) {
  const temAlgo = songId || linkPagina || linkBasica || linkAudio || linkMp4;
  if (!temAlgo) {
    return (
      <section className="bg-white rounded-xl border border-dashed border-gray-200 p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{titulo}</h2>
        <p className="text-sm text-gray-400 mt-2">Ainda não gerada.</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{titulo}</h2>
        {songId && <span className="text-[11px] font-mono text-gray-400 truncate">{songId}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {linkPagina && <LinkBtn href={linkPagina} label="🔗 Página Premium" />}
        {linkBasica && <LinkBtn href={linkBasica} label="🔗 Página Básica" />}
        {linkAudio && (
          <a
            href={`/api/download?url=${encodeURIComponent(linkAudio)}&filename=${encodeURIComponent(`${nomeArquivo || "audio"}.mp3`)}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors font-medium"
          >
            🎵 Áudio
          </a>
        )}
        {linkMp4 && <LinkBtn href={linkMp4} label="🎬 MP4" />}
      </div>
    </section>
  );
}

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
