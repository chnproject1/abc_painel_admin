/**
 * Corrige domínios de e-mail digitados errado (gmial.com, hotmai.com, gmail.con…)
 * antes do primeiro envio. Só mexe no que é certeza: a parte antes do @ não muda,
 * e domínios que existem (hotmail.com.mx, yahoo.com.mx…) passam como estão.
 */
const DOMINIOS: Record<string, string[]> = {
  "gmail.com": ["gmial.com", "gmai.com", "gamil.com", "gmal.com", "gnail.com", "gmaill.com", "gmil.com", "gmali.com", "gmeil.com", "gmail.co", "gmail.cm", "gmail.om", "gmail.com.mx", "gmail.es", "gmail.comm"],
  "hotmail.com": ["hotmai.com", "hotmial.com", "hotmal.com", "hotmil.com", "hotamil.com", "hotmaill.com", "homail.com", "hotmail.co", "hotmail.cm", "hotmail.om", "hotmail.comm"],
  "yahoo.com": ["yaho.com", "yahooo.com", "yhoo.com", "yahoo.co", "yahoo.cm", "yahoo.comm"],
  "outlook.com": ["outlok.com", "outllok.com", "outloo.com", "outlook.co", "outlook.cm", "outlook.comm"],
  "icloud.com": ["iclod.com", "icloud.co", "icloud.cm", "icloud.comm"],
};
const CERTO: Record<string, string> = Object.fromEntries(
  Object.entries(DOMINIOS).flatMap(([certo, errados]) => errados.map((e) => [e, certo])),
);

export function corrigirEmail(bruto: unknown): string {
  const email = String(bruto ?? "").split("?")[0].trim().toLowerCase().replace(/\s+/g, "");
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  // ".con" / ".comm" no fim (gmail.con, hotmail.com.mx.con…) → ".com"
  const dominio = email.slice(at + 1).replace(/\.(con|comm|vom|xom)$/, ".com");
  return `${email.slice(0, at)}@${CERTO[dominio] ?? dominio}`;
}
