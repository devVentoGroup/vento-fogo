# FOGO

FOGO es la app Vento OS para recetas, recipe book operacional y lotes de produccion.

## Estado actual

- `/recipes`: administracion de recetas.
- `/recipes/new`: creacion de receta.
- `/recipe-book`: experiencia operacional para consultar recetas publicadas.
- `/production-batches`: lotes de produccion.
- `/production-batches/new`: creacion de lote desde receta.

La base de datos, RPCs, permisos y migraciones compartidas viven en `vento-shell`.

## Desarrollo

```bash
npm install
npm run dev
```

Puerto local esperado: `3004`.

## Documentacion

- `docs/ESTADO-ACTUAL-FOGO-2026-05-28.md`
