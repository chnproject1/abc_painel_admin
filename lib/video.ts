import { randomBytes } from "crypto";

/*
  Upsell de vídeo — regras compartilhadas pelas rotas /api/n8n, /api/video
  e /api/checkout. Tudo que é do vídeo mora na tabela PedidoVideo (1:1 com
  Pedido). O portal só guarda e responde: quem orquestra é o n8n, quem
  renderiza é o container na VPS, quem fala com o cliente é a página /upvideo.
*/

// Venda (status) e produção (producao) em colunas separadas, como em Pedido.
export const VIDEO_STATUS   = ["pendente", "pago"] as const;
export const VIDEO_PRODUCAO = ["aguardando_fotos", "fotos_enviadas", "renderizando", "concluido", "erro"] as const;

export const VIDEO_FOTOS_MIN = 1;   // a página exige mais; aqui só o que não pode passar
export const VIDEO_FOTOS_MAX = 15;

export const TOKEN_RE = /^[a-f0-9]{16,64}$/;

export function gerarToken(): string {
  return randomBytes(18).toString("hex");   // 36 hex — imprevisível, cabe na variável do template
}

// Base da página do upsell. O link enviado ao cliente é <base>?t=<token>.
export function linkVideo(token: string): string {
  const base = (process.env.UPVIDEO_URL || "https://abcmusic-quiz.netlify.app/upvideo/").replace(/\/?$/, "/");
  return `${base}?t=${token}`;
}

// Pedaço do link depois da raiz do site, pra variável do botão do template do
// WhatsApp (prefixo fixo "https://abcmusic-quiz.netlify.app/"). Ex.: "upvideo/?t=abc".
export function sufixoLink(link: string): string {
  const u = new URL(link);
  return u.pathname.replace(/^\//, "") + u.search;
}

// URL pública de um path guardado na tabela ("fotos/<token>/1.jpg", "videos/<token>/final.mp4").
// Os buckets são públicos, então o link não expira.
export function urlPublica(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.SUPABASE_PUBLIC_URL || "https://baltzukuszagxcgkfrpi.supabase.co").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${path}`;
}

// Fotos vindas da página: [{path, w, h, ordem}]. Só aceita paths dentro da
// pasta do próprio token — impede apontar pra foto de outro cliente.
export function validarFotos(fotos: unknown, token: string): { ok: true; fotos: Foto[] } | { ok: false; erro: string } {
  if (!Array.isArray(fotos)) return { ok: false, erro: "fotos deve ser uma lista" };
  if (fotos.length < VIDEO_FOTOS_MIN || fotos.length > VIDEO_FOTOS_MAX) {
    return { ok: false, erro: `envie de ${VIDEO_FOTOS_MIN} a ${VIDEO_FOTOS_MAX} fotos` };
  }
  const prefixo = `fotos/${token}/`;
  const limpas: Foto[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i] ?? {};
    const path = String(f.path ?? "");
    if (!path.startsWith(prefixo) || /[^a-z0-9_./-]/i.test(path) || path.includes("..")) {
      return { ok: false, erro: `path inválido: ${path}` };
    }
    limpas.push({
      path,
      w: Number(f.w) || 0,
      h: Number(f.h) || 0,
      ordem: i + 1,
    });
  }
  return { ok: true, fotos: limpas };
}

export type Foto = { path: string; w: number; h: number; ordem: number };

const UTM_CAMPOS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function extrairUtm(src: any): Partial<Record<(typeof UTM_CAMPOS)[number], string | null>> {
  const out: Record<string, string | null> = {};
  for (const k of UTM_CAMPOS) {
    const v = src?.[k];
    if (v !== undefined) out[k] = v ? String(v).slice(0, 200) : null;
  }
  return out;
}
