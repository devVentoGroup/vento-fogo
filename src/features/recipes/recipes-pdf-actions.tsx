"use client";

import Link from "next/link";

export function RecipesPdfLink({ href }: { href: string }) {
  return (
    <Link href={href} className="ui-btn ui-btn--ghost ui-btn--sm">
      Exportar PDF
    </Link>
  );
}

export function PrintRecipesPdfButton() {
  return (
    <button type="button" onClick={() => window.print()} className="ui-btn ui-btn--brand ui-btn--sm">
      Imprimir / guardar PDF
    </button>
  );
}
