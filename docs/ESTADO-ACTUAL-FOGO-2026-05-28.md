# Estado actual FOGO

Fecha: 2026-05-28
Rol: recetas, recipe book operacional y lotes de produccion.

## Implementado

- Auth/SSO con Vento Shell y permisos de app.
- Rutas principales: `/recipes`, `/recipes/new`, `/recipe-book`, `/production-batches`, `/production-batches/new`.
- Recetas con campos base, contexto, ingredientes y pasos.
- Recipe book como vista operacional separada de administracion de recetas.
- Creacion de lotes de produccion desde recetas publicadas mediante contrato de Shell.
- Areas de produccion alineadas con `site_area_purpose_rules` y proposito `production_recipe`.
- Permisos separados para gestionar recetas, ver recipe book, crear lotes y ver lotes.

## Estado real de integracion

- FOGO no debe duplicar inventario ni LOCs. Consume productos/stock/areas desde Shell y debe reflejar impactos en Nexo mediante movimientos auditables.
- Nexo conserva inventario/logistica; Fogo conserva BOM, recetas, ejecucion y rendimiento.
- Origo abastece compras; Fogo no debe convertirse en modulo de compras.

## Pendiente para sinergia

1. Ejecucion completa de produccion con UX de planta: iniciar, consumir, registrar merma, terminar y cerrar lote.
2. Trazabilidad visible hacia Nexo: insumos consumidos y producto terminado por LOC/sede.
3. Costeo de receta/lote con rendimiento real vs esperado.
4. Etiquetas de lote y expiracion conectadas al sistema de printing cuando aplique.
5. Pruebas de permisos y validacion de areas productivas por sede.
