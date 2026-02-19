import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";

export default async function ProductionBatchesPage() {
  await requireAppAccess({
    appId: APP_ID,
    returnTo: "/production-batches",
    permissionCode: "production.batches",
  });

  return (
    <section className="ui-panel space-y-3">
      <h1 className="ui-h1">Lotes de produccion</h1>
      <p className="ui-body-muted">
        Pantalla base de lotes activa para recibir la logica migrada desde Nexo.
      </p>
    </section>
  );
}
