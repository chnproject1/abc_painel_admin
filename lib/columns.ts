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

/* ──────────────────────────────────────────────────────────────
   Operação Estados Unidos (model PedidoUs)
   Sem telefone e sem campos fiscais brasileiros.
   Três slots de música: 1 = venda inicial, 2 e 3 = upsell 2.
   ────────────────────────────────────────────────────────────── */

// Campos visíveis para PRODUTOR (só o necessário para produzir as músicas)
export const CAMPOS_US_PRODUTOR = [
  "id",
  "nome",
  "email",
  "status",
  "up2_status",
  "idioma",
  "estilo",
  "letra",
  "song_id",
  "link_pagina",
  "link_basica",
  "link_audio",
  "link_mp4",
  "song_id2",
  "link_pagina2",
  "link_basica2",
  "link_audio2",
  "song_id3",
  "link_pagina3",
  "link_basica3",
  "link_audio3",
] as const;

// Campos visíveis para OPERADOR (sem dados sensíveis de negócio)
export const CAMPOS_US_OPERADOR = [
  ...CAMPOS_US_PRODUTOR,
  "plano",
  "up1_status",
  "ds_status",
  "gerou_musica",
  "erro_geracao",
  "data_entrega",
  "entrega_email",
  "up_gerou_musica",
  "up_erro_geracao",
  "up_data_entrega",
  "up_entrega_email",
] as const;

// Campos extras visíveis apenas para ADMIN
export const CAMPOS_US_ADMIN_EXTRAS = [
  "nomefiscal",
  "zip_code",
  "data_pedido",
  "valor",
  "up1_valor",
  "up2_valor",
  "ds_valor",
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
  "funil",
  "recovery_id",
  "recuperacao",
] as const;

export function selectPorRoleUs(role: string) {
  if (role === "PRODUTOR") {
    return Object.fromEntries(CAMPOS_US_PRODUTOR.map((c) => [c, true]));
  }
  const base = Object.fromEntries(CAMPOS_US_OPERADOR.map((c) => [c, true]));
  if (role === "ADMIN") {
    CAMPOS_US_ADMIN_EXTRAS.forEach((c) => (base[c] = true));
  }
  return base;
}
