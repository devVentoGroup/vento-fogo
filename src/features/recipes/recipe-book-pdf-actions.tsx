"use client";

type Props = {
  backHref: string;
};

export function RecipeBookPdfActions({ backHref }: Props) {
  return (
    <div className="print:hidden sticky top-0 z-20 border-b border-[#E7D8CA] bg-[#FFFDFC]/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C2410C]">
            Vista imprimible
          </div>
          <div className="text-sm text-[#6B625D]">
            Usa el boton para guardar como PDF desde el navegador.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={backHref}
            className="rounded-full border border-[#E7D8CA] bg-white px-4 py-2 text-sm font-semibold text-[#2B211D] shadow-sm transition hover:bg-[#FFF7ED]"
          >
            Volver al recetario
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-[#C2410C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9A3412]"
          >
            Imprimir / guardar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
