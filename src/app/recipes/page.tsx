import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";

export default async function RecipesPage() {
  await requireAppAccess({
    appId: APP_ID,
    returnTo: "/recipes",
    permissionCode: "production.recipes",
  });

  return (
    <section className="ui-panel space-y-3">
      <h1 className="ui-h1">Recetas</h1>
      <p className="ui-body-muted">
        Modulo habilitado para centralizar BOM, pasos y medios. Se mantiene en rollout progresivo.
      </p>
    </section>
  );
}
