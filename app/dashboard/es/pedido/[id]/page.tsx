"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { liberacoes, dsTipoDe, DS_ROTULO } from "@/lib/es-ofertas";
import { PRODUCAO_LABEL, estadoVideoEs as estadoVideoEs_ } from "@/lib/video-estado";

interface PedidoEs {
  id: string;
  nome: string;
  email: string;
  nomefiscal?: string;
  comprador?: string;
  zip_code?: string;
  pais?: string;
  upsell_payment_id?: string;
  upsell_erro?: string;
  plano: string;
  idioma?: string;
  status: string;
  up1_status?: string | null;
  up2_status?: string | null;
  ds_status?: string | null;
  estilo?: string;
  letra?: string;

  gerou_musica: boolean;
  erro_geracao?: boolean;
  song_id?: string;
  link_pagina?: string;
  link_basica?: string;
  link_audio?: string;
  link_mp4?: string;
  data_entrega?: string;
  entrega_email: boolean;

  pagina_entrega_email: boolean;
  pagina_data_entrega?: string;

  up_gerou_musica: boolean;
  up_erro_geracao?: boolean;
  song_id2?: string;
  link_pagina2?: string;
  link_basica2?: string;
  link_audio2?: string;
  song_id3?: string;
  link_pagina3?: string;
  link_basica3?: string;
  link_audio3?: string;
  up_data_entrega?: string;
  up_entrega_email: boolean;

  data_pedido?: string;
  valor?: string;
  up1_valor?: string;
  up2_valor?: string;
  ds_valor?: string;

  // Rastreio por oferta (UTMify/Meta/TikTok) — só vem pro admin
  rastreado?: boolean;
  up1_rastreado?: boolean;
  up2_rastreado?: boolean;
  ds_rastreado?: boolean;

  // Vídeo (upsell 2 / downsell com vídeo): só existe em pedido novo (LATAM)
  video?: {
    producao: string; entrega_email: boolean; erro_msg?: string | null; fotos_qtd: number; tentativas: number;
    rastreado?: boolean;
    aberto_em?: string | null; fotos_em?: string | null; concluido_em?: string | null; entregue_em?: string | null;
    atualizado_em?: string | null; criado_em?: string | null;
    link: string; ver_link: string; video_url?: string | null;
  } | null;
}

interface Toast { tipo: "ok" | "erro"; texto: string }

const STATUS_COR: Record<string, string> = {
  pendente:  "bg-gray-100 text-gray-600",
  pago:      "bg-green-100 text-green-700",
  recusado:  "bg-gray-100 text-gray-400",
  cancelado: "bg-red-100 text-red-700",
};

const usd = (v?: string | null) =>
  v == null ? null : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function PedidoEsPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();

  const [pedido, setPedido] = useState<PedidoEs | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const [letra, setLetra]   = useState("");
  const [estilo, setEstilo] = useState("");
  const [letraSalva, setLetraSalva]   = useState("");
  const [estiloSalvo, setEstiloSalvo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const temAlteracao = letra !== letraSalva || estilo !== estiloSalvo;

  const [toast, setToast] = useState<Toast | null>(null);
  const [acionando, setAcionando] = useState<string | null>(null);

  const isAdmin = (session?.user as any)?.role === "ADMIN";

  function mostrarToast(tipo: "ok" | "erro", texto: string) {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    fetch(`/api/es/pedido/${id}`)
      .then(async (r) => {
        if (r.status === 404) { setNaoEncontrado(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setPedido(data);
        setLetra(data.letra ?? "");
        setEstilo(data.estilo ?? "");
        setLetraSalva(data.letra ?? "");
        setEstiloSalvo(data.estilo ?? "");
      })
      .catch(() => setNaoEncontrado(true));
  }, [id]);

  async function salvarLetra() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/es/pedido/${id}`, {
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

  // Dispara os fluxos n8n da operação ES (LATAM)
  async function acionar(tipo: string, alvo?: string) {
    const chave = alvo ? tipo + ":" + alvo : tipo;
    setAcionando(chave);
    try {
      const res = await fetch("/api/es/trigger/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, ...(alvo ? { alvo } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao acionar");
      mostrarToast("ok", "Fluxo acionado no n8n.");
    } catch (e: any) {
      mostrarToast("erro", e.message || "Erro ao acionar o fluxo.");
    } finally {
      setAcionando(null);
    }
  }

  if (naoEncontrado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50">
        <p className="text-gray-500">Pedido não encontrado.</p>
        <button onClick={() => router.push("/dashboard/es")} className="text-sm text-avocado-600 hover:text-avocado-700 font-medium">
          ← Voltar ao dashboard ES
        </button>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  const musicaGerada = pedido.gerou_musica || !!pedido.link_audio || !!pedido.link_pagina;
  /* O que o cliente tem direito: regra em lib/es-ofertas.ts. As páginas Premium
     são sempre geradas; a oferta só decide se o link vai no e-mail. */
  const lib = liberacoes(pedido);
  const entregaPagina = lib.pagina;
  // Pedido novo (LATAM): up2 = vídeo, com linha em PedidoVideoEs.
  // Pedido antigo (EUA): up2 = músicas extras, sem linha de vídeo.
  const temVideo  = !!pedido.video;
  const temExtras = !temVideo && (pedido.up2_status === "pago" || pedido.ds_status === "pago");
  const dsTipo = pedido.ds_status === "pago" ? dsTipoDe(pedido) : null;
  // Nenhuma oferta do funil pode ser paga sem a venda inicial ter sido paga:
  // se isso acontece, o checkout registrou o upsell mas não a confirmação.
  const ofertaPaga = entregaPagina || lib.video || temExtras;
  const vendaInconsistente = ofertaPaga && pedido.status !== "pago";
  const estadoVideoEs = temVideo ? estadoVideoEs_(pedido.video!) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.tipo === "ok" ? "bg-avocado-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.tipo === "ok" ? "✓" : "✕"} {toast.texto}
        </div>
      )}

      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800 font-medium shrink-0">
          ← Voltar
        </button>
        <button onClick={() => router.push("/dashboard/es")} className="text-sm text-gray-500 hover:text-gray-800 font-medium shrink-0">
          ⌂ Início
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <h1 className="text-base font-bold text-gray-900 truncate">{pedido.nome}</h1>
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700 shrink-0">{pedido.pais === "US" ? "🇺🇸 US" : "🌎 LATAM"}</span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${STATUS_COR[pedido.status] ?? "bg-gray-100 text-gray-600"}`}>
            {pedido.status}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Funil de ofertas */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Funil de ofertas</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Rastreio por oferta: cada uma é um pedido próprio na UTMify. Só admin. */}
            <OfertaBox titulo="Venda inicial" descricao="Música 1"        status={pedido.status}     valor={usd(pedido.valor)}     rastreado={isAdmin ? pedido.rastreado : undefined} />
            <OfertaBox titulo="Upsell 1"      descricao="Página Premium"  status={pedido.up1_status} valor={usd(pedido.up1_valor)} rastreado={isAdmin ? pedido.up1_rastreado : undefined} />
            <OfertaBox titulo="Upsell 2"      descricao={temExtras ? "Músicas 2 e 3" : "Vídeo com fotos"} status={pedido.up2_status} valor={usd(pedido.up2_valor)} rastreado={isAdmin ? pedido.up2_rastreado : undefined} />
            <OfertaBox titulo="Downsell"      descricao={dsTipo ? DS_ROTULO[dsTipo] : (temExtras ? "Página + músicas" : "O que faltou")} status={pedido.ds_status}  valor={usd(pedido.ds_valor)} rastreado={isAdmin ? pedido.ds_rastreado : undefined} />
          </div>
        </section>

        {/* Entregas — cinza: comprado, ainda não gerado · amarelo: gerado, não
            enviado · verde: enviado ao cliente */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Entregas</h2>
          {vendaInconsistente && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <strong>Dado inconsistente:</strong> há oferta do funil paga, mas a venda inicial
              está como <strong>{pedido.status}</strong>. O checkout registrou o upsell e não a
              confirmação de pagamento — verifique o webhook da Stripe para este pedido.
            </p>
          )}
          <div className="divide-y divide-gray-100">
            <Entrega
              label="Música 1 — venda inicial"
              comprado={pedido.status === "pago"}
              gerado={pedido.gerou_musica || !!pedido.link_audio}
              entregue={pedido.entrega_email}
              quando={pedido.data_entrega}
            />
            <Entrega
              label="Página Premium — upsell 1 / downsell"
              comprado={entregaPagina}
              gerado={!!pedido.link_pagina}
              entregue={pedido.pagina_entrega_email}
              quando={pedido.pagina_data_entrega}
            />
            {temExtras && (
              <Entrega
                label="Músicas 2 e 3 — upsell 2 / downsell (pedido antigo)"
                comprado={temExtras}
                gerado={pedido.up_gerou_musica}
                entregue={pedido.up_entrega_email}
                quando={pedido.up_data_entrega}
              />
            )}
            {!temExtras && (
              <Entrega
                label="Vídeo com fotos — upsell 2 / downsell"
                comprado={lib.video}
                gerado={!!pedido.video?.video_url}
                entregue={!!pedido.video?.entrega_email}
                quando={pedido.video?.entregue_em}
              />
            )}
          </div>
        </section>

        {/* Vídeo (upsell 2 / ds2 / ds3) — mesmo desenho do bloco do BR
            (app/dashboard/pedido/[id]); a entrega aqui é por e-mail. */}
        {temVideo && estadoVideoEs && (() => {
          const v = pedido.video!; const e = estadoVideoEs;
          const dt = (d?: string | null) => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
          // Qual venda liberou o vídeo: o upsell 2, ou o downsell (ds2 = só o vídeo, ds3 = página + vídeo)
          const venda = pedido.up2_status === "pago"
            ? `Pago · ${usd(pedido.up2_valor) ?? "—"} (upsell 2)`
            : pedido.ds_status === "pago"
              ? `Pago · ${usd(pedido.ds_valor) ?? "—"} (${dsTipo ?? "downsell"})`
              : "Não pagou";
          return (
            <section className={`rounded-xl border p-5 ${e.chave === "erro" ? "bg-red-50 border-red-200" : e.chave === "pendente_envio" ? "bg-yellow-50 border-yellow-200" : "bg-white border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">🎬 Vídeo (upsell)</h2>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${e.cor}`}>{e.rotulo}</span>
              </div>
              <p className={`text-sm mb-4 ${e.chave === "erro" ? "text-red-700" : e.chave === "pendente_envio" ? "text-yellow-800" : "text-gray-600"}`}>{e.detalhe}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <Campo label="Venda" valor={venda} />
                <Campo label="Produção" valor={PRODUCAO_LABEL[v.producao] ?? v.producao} />
                <Campo label="Fotos" valor={v.fotos_qtd ? `${v.fotos_qtd} enviadas` : "nenhuma"} />
                <Campo label="Entrega e-mail" valor={v.entrega_email ? "✓ Enviado" : "✕ Não enviado"} />
              </div>
              {/* Rastreio e linha do tempo são diagnóstico de operação: ficam só
                  para o admin, igual ao BR. */}
              {isAdmin && (
                <p className={`text-xs font-medium mb-4 ${v.rastreado ? "text-avocado-600" : "text-blue-700"}`}>
                  {v.rastreado ? "✓ Venda registrada na UTMify" : "Venda ainda não registrada na UTMify (sem rastreio)"}
                </p>
              )}
              {isAdmin && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Campo label="Pago em" valor={dt(v.criado_em) ?? "—"} />
                  <Campo label="Abriu o link" valor={dt(v.aberto_em) ?? "—"} />
                  <Campo label="Fotos em" valor={dt(v.fotos_em) ?? "—"} />
                  <Campo label="Concluído em" valor={dt(v.concluido_em) ?? "—"} />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {e.chave === "erro" && (
                  <button onClick={() => acionar("video")} disabled={!!acionando}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                    {acionando === "video" ? "Enviando..." : "🔄 Mandar pra produção de novo"}
                  </button>
                )}
                {v.video_url && (
                  <a href={`/api/download?url=${encodeURIComponent(v.video_url)}&filename=${encodeURIComponent(`video-${pedido.nome || "cliente"}.mp4`)}`}
                     className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-avocado-600 hover:bg-avocado-700 text-white text-sm font-medium transition-colors">
                    ⬇️ Baixar vídeo
                  </a>
                )}
                {v.video_url && <LinkBtn href={v.ver_link} label="▶️ Ver vídeo" />}
                <LinkBtn href={v.link} label="🔗 Página de fotos" />
              </div>
              {e.chave === "pendente_envio" && (
                <p className="text-xs text-yellow-800 mt-3">Vídeo pronto e o e-mail não saiu. Use "Enviar ao cliente" ou mande o link da página do vídeo para <span className="font-mono">{pedido.email?.split("?")[0]}</span>.</p>
              )}
            </section>
          );
        })()}

        {/* Cliente + Pedido */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Cliente</h2>
            <div className="space-y-3">
              <Campo label="Nome" valor={pedido.nome} />
              <Campo label="E-mail" valor={pedido.email?.split("?")[0]} />
              {isAdmin && (
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Nome fiscal" valor={pedido.nomefiscal} />
                  <Campo label="Nome no cartão" valor={pedido.comprador} />
                  <Campo label="ZIP code" valor={pedido.zip_code} />
                  <Campo label="País" valor={pedido.pais} />
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Pedido</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Plano" valor={pedido.plano} mono />
                <Campo label="Estilo" valor={pedido.estilo} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Idioma" valor={pedido.idioma} />
                {pedido.data_entrega && (
                  <Campo label="Entrega principal" valor={new Date(pedido.data_entrega).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
                )}
              </div>
              {temExtras && pedido.up_data_entrega && (
                <Campo label="Entrega das extras" valor={new Date(pedido.up_data_entrega).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
              )}
              {pedido.data_pedido && (
                <Campo label="Data do pedido" valor={new Date(pedido.data_pedido).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
              )}
              <Campo label="ID do pedido" valor={pedido.id} mono />
              <Campo label="Erro no upsell" valor={pedido.upsell_erro} />
            </div>
          </section>
        </div>

        {/* Músicas — um bloco por slot. Todos os links aparecem sempre;
            entregaPagina indica apenas se o cliente recebe o link Premium. */}
        <Musica
          titulo="Música 1 — venda inicial"
          nomeArquivo={pedido.nome}
          songId={pedido.song_id}
          linkPagina={pedido.link_pagina}
          linkBasica={pedido.link_basica}
          linkAudio={pedido.link_audio}
          linkMp4={pedido.link_mp4}
          entregaPagina={entregaPagina}
        />

        {temExtras && (
          <>
            <Musica
              titulo="Música 2 — upsell 2"
              nomeArquivo={`${pedido.nome} 2`}
              songId={pedido.song_id2}
              linkPagina={pedido.link_pagina2}
              linkBasica={pedido.link_basica2}
              linkAudio={pedido.link_audio2}
              entregaPagina={entregaPagina}
            />
            <Musica
              titulo="Música 3 — upsell 2"
              nomeArquivo={`${pedido.nome} 3`}
              songId={pedido.song_id3}
              linkPagina={pedido.link_pagina3}
              linkBasica={pedido.link_basica3}
              linkAudio={pedido.link_audio3}
              entregaPagina={entregaPagina}
            />
          </>
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
              placeholder="Ex: Pop, Country, R&B..."
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

        {/* Ações — mesmo formato do BR, com um "gerar e enviar" a mais */}
        <section className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <Acao
            titulo="Enviar ao cliente"
            descricao="Envia por e-mail tudo o que já foi gerado — música principal, extras e páginas conforme o que ele comprou."
            rotulo={acionando === "envio" ? "Enviando..." : "Enviar"}
            cor="bg-blue-600 hover:bg-blue-700"
            disabled={!!acionando}
            onClick={() => acionar("envio")}
          />

          <Acao
            titulo="Gerar música principal"
            descricao="Reenvia para produção e atualiza a música 1 do cliente."
            rotulo={acionando === "principal" ? "Gerando..." : "Gerar e enviar"}
            disabled={!!acionando}
            onClick={() => acionar("principal")}
          />

          {temExtras ? (
            <Acao
              titulo="Gerar músicas extras"
              descricao="Pedido antigo: reenvia para produção e atualiza as músicas 2 e 3."
              rotulo={acionando === "upsell" ? "Gerando..." : "Gerar e enviar"}
              disabled={!!acionando}
              onClick={() => acionar("upsell")}
            />
          ) : (
            <Acao
              titulo="Refazer o vídeo"
              descricao={temVideo
                ? (pedido.video!.producao === "aguardando_fotos" ? "Indisponível — o cliente ainda não enviou as fotos." : "Renderiza de novo com as fotos já enviadas e reenvia o e-mail.")
                : "Indisponível — este cliente não comprou o vídeo."}
              rotulo={acionando === "video" ? "Gerando..." : "Refazer e enviar"}
              disabled={!!acionando || !temVideo || pedido.video!.producao === "aguardando_fotos"}
              onClick={() => acionar("video")}
            />
          )}
        </section>

      </main>
    </div>
  );
}

/* ── Sub-componentes ── */


/** Uma linha de entrega, com os três estados que o pedido pode ter. */
function Entrega({
  label, comprado, gerado, entregue, quando,
}: {
  label: string;
  comprado: boolean;
  gerado: boolean;
  entregue: boolean;
  quando?: string | null;
}) {
  if (!comprado) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <span className="text-sm text-gray-300">{label}</span>
        <span className="text-xs text-gray-300 shrink-0">não comprado</span>
      </div>
    );
  }

  const estado = entregue
    ? { cor: "text-green-600", texto: "✓ Entregue" }
    : gerado
    ? { cor: "text-yellow-600", texto: "● Gerado — aguardando envio" }
    // Pagou e não tem nada produzido: é alarme, não espera tranquila
    : { cor: "text-red-600", texto: "✕ Pago — nada gerado" };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`text-sm font-medium shrink-0 ${estado.cor}`}>
        {estado.texto}
        {entregue && quando && (
          <span className="text-xs font-normal text-gray-400 ml-2">
            {new Date(quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
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

function OfertaBox({
  titulo, descricao, status, valor, rastreado,
}: {
  titulo: string; descricao: string; status?: string | null; valor?: string | null;
  /** undefined = não mostra (operador, ou pedido antigo sem o campo) */
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
      {/* Só faz sentido pra oferta paga: é ela que vira pedido na UTMify */}
      {status === "pago" && rastreado !== undefined && (
        <p className={`text-[11px] font-medium mt-1.5 ${rastreado ? "text-avocado-600" : "text-blue-700"}`}>
          {rastreado ? "✓ UTMify" : "Sem rastreio"}
        </p>
      )}
    </div>
  );
}

function Musica({
  titulo, nomeArquivo, songId, linkPagina, linkBasica, linkAudio, linkMp4, entregaPagina,
}: {
  titulo: string;
  nomeArquivo: string;
  songId?: string;
  linkPagina?: string;
  linkBasica?: string;
  linkAudio?: string;
  linkMp4?: string;
  entregaPagina?: boolean;
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
      {linkPagina && !entregaPagina && (
        <p className="text-xs text-yellow-700 mt-3">
          Página Premium gerada, mas o cliente <strong>não tem direito</strong> a ela — sem upsell 1 nem downsell.
        </p>
      )}
    </section>
  );
}

function Campo({
  label, valor, mono,
}: {
  label: string; valor?: string | null; mono?: boolean;
}) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium text-gray-800 break-words ${mono ? "font-mono text-xs" : ""}`}>{valor}</p>
    </div>
  );
}

function LinkBtn({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors font-medium"
    >
      {label}
    </a>
  );
}
