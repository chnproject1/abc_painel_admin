"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Alterna entre as duas operações. Cada país tem tabela e rotas próprias,
// então o seletor navega entre seções em vez de filtrar uma lista única.
export default function SeletorPais() {
  const pathname = usePathname();
  const noUs = pathname?.startsWith("/dashboard/us");

  const base = "px-3 py-1.5 text-sm font-medium transition-colors";
  const ativo = "bg-gray-800 text-white";
  const inativo = "bg-white text-gray-500 hover:text-gray-800";

  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
      <Link href="/dashboard" className={`${base} ${noUs ? inativo : ativo}`}>
        🇧🇷 BR
      </Link>
      <Link href="/dashboard/us" className={`${base} border-l border-gray-200 ${noUs ? ativo : inativo}`}>
        🇺🇸 US
      </Link>
    </div>
  );
}
