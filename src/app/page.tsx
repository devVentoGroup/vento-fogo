import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const RETURN_TO = "/";

export default async function FogoHomePage() {
  await requireAppAccess({ appId: APP_ID, returnTo: RETURN_TO });

  return (
    <div className="w-full space-y-6">
      <section className="ui-panel space-y-3">
        <h1 className="ui-h1">FOGO</h1>
        <p className="ui-body-muted">
          Recetario y ejecucion de lotes para produccion. Desde aqui se define BOM, pasos y salida
          de terminados hacia inventario.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link href="/recipes" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Recetas</div>
          <p className="mt-1 ui-body-muted">
            Gestion de ingredientes, pasos y medios operativos por producto.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">
            Ir a recetas
          </span>
        </Link>

        <Link href="/production-batches" className="ui-panel block transition hover:shadow-lg">
          <div className="ui-h3">Lotes de produccion</div>
          <p className="mt-1 ui-body-muted">
            Ejecucion de produccion con consumo de BOM e ingreso de terminado.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--ui-brand-600)]">
            Ir a lotes
          </span>
        </Link>
      </section>
    </div>
  );
}
