// Campos visíveis para PRODUTOR (só o necessário para produzir a música)
export const CAMPOS_PRODUTOR = [
  "id",
  "nome",
  "telefone",
  "email",
  "status",
  "estilo",
  "letra",
  "link_pagina",
  "link_basica",
  "link_audio",
  "link_mp4",
] as const;

// Campos visíveis para OPERADOR (sem dados sensíveis de negócio)
export const CAMPOS_OPERADOR = [
  "id",
  "nome",
  "telefone",
  "email",
  "plano",
  "status",
  "estilo",
  "letra",
  "gerou_musica",
  "link_pagina",
  "link_basica",
  "link_audio",
  "song_id",
  "data_entrega",
  "entrega_whatsapp",
  "entrega_email",
  "link_mp4",
] as const;

// Campos extras visíveis apenas para ADMIN
export const CAMPOS_ADMIN_EXTRAS = [
  "data_pedido",
  "valor",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
  "utm_term",
  "utm_id",
  "fbclid",
  "ttclid",
  "pixel_id",
  "ip",
] as const;

export function selectPorRole(role: string) {
  if (role === "PRODUTOR") {
    return Object.fromEntries(CAMPOS_PRODUTOR.map((c) => [c, true]));
  }
  const base = Object.fromEntries(CAMPOS_OPERADOR.map((c) => [c, true]));
  if (role === "ADMIN") {
    CAMPOS_ADMIN_EXTRAS.forEach((c) => (base[c] = true));
  }
  return base;
}
