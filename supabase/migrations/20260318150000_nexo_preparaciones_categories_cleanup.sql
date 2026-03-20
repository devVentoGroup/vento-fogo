-- Limpieza de categorías de preparaciones:
-- 1) Migra productos desde categorías legacy (WIP) a las nuevas hojas canon.
-- 2) Elimina categorías legacy de preparaciones (mantiene solo preparacion-* y preparaciones-padre-*).

begin;

-- 1) Reasignar productos desde categorías antiguas a las nuevas hojas canon.

-- Helpers: obtener id de hoja por slug (global, sin parent específico).
with
  hoja_salsas_listas as (
    select id from public.product_categories
    where slug = 'preparacion-salsas-listas' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_salsas_madre as (
    select id from public.product_categories
    where slug = 'preparacion-salsas-madre-bases-saladas' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_masas_saladas as (
    select id from public.product_categories
    where slug = 'preparacion-masas-bases-saladas' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_masas_dulces as (
    select id from public.product_categories
    where slug = 'preparacion-masas-bases-dulces' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_fermentos as (
    select id from public.product_categories
    where slug = 'preparacion-fermentos-masas-madre' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_mise_proteina as (
    select id from public.product_categories
    where slug = 'preparacion-mise-en-place-proteina' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_mise_vegetal as (
    select id from public.product_categories
    where slug = 'preparacion-mise-en-place-vegetal' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_cremas_rellenos_dulces as (
    select id from public.product_categories
    where slug = 'preparacion-cremas-rellenos-dulces' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_salsas_coulis_dulces as (
    select id from public.product_categories
    where slug = 'preparacion-salsas-coulis-dulces' and site_id is null
    order by created_at asc limit 1
  ),
  hoja_toppings_decoraciones as (
    select id from public.product_categories
    where slug = 'preparacion-toppings-decoraciones' and site_id is null
    order by created_at asc limit 1
  )
-- Usamos DO para poder leer las hojas y aplicar los updates en bloque.
do $$
declare
  v_salsas_listas uuid;
  v_salsas_madre uuid;
  v_masas_saladas uuid;
  v_masas_dulces uuid;
  v_fermentos uuid;
  v_mise_proteina uuid;
  v_mise_vegetal uuid;
  v_cremas_rellenos uuid;
  v_salsas_coulis uuid;
  v_toppings uuid;
begin
  select id into v_salsas_listas from hoja_salsas_listas;
  select id into v_salsas_madre from hoja_salsas_madre;
  select id into v_masas_saladas from hoja_masas_saladas;
  select id into v_masas_dulces from hoja_masas_dulces;
  select id into v_fermentos from hoja_fermentos;
  select id into v_mise_proteina from hoja_mise_proteina;
  select id into v_mise_vegetal from hoja_mise_vegetal;
  select id into v_cremas_rellenos from hoja_cremas_rellenos_dulces;
  select id into v_salsas_coulis from hoja_salsas_coulis_dulces;
  select id into v_toppings from hoja_toppings_decoraciones;

  -- Aderezos fríos -> Salsas listas para servicio
  if v_salsas_listas is not null then
    update public.products
    set category_id = v_salsas_listas
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories where slug in ('aderezos-frios')
      );
  end if;

  -- Salsas blancas/cremosas y rojas, y el padre batch -> Salsas madre/bases saladas
  if v_salsas_madre is not null then
    update public.products
    set category_id = v_salsas_madre
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories
        where slug in ('salsas-blancas-cremosas', 'salsas-rojas', 'salsas-madre-y-aderezos-batch')
      );
  end if;

  -- Bases de Masa y Panadería + Masas crudas + Panadería pre-cocida -> Masas y bases saladas
  if v_masas_saladas is not null then
    update public.products
    set category_id = v_masas_saladas
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories
        where slug in (
          'bases-de-masa-y-panaderia-critico-para-saudo-y-vento-cafe',
          'masas-crudas',
          'panaderia-pre-cocida'
        )
      );
  end if;

  -- Fermentos (legacy) -> Fermentos y masas madre (nueva hoja)
  if v_fermentos is not null then
    update public.products
    set category_id = v_fermentos
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories where slug = 'fermentos'
      );
  end if;

  -- Proteínas procesadas (carnes/cerdos/pollo) -> Mise en place de proteína
  if v_mise_proteina is not null then
    update public.products
    set category_id = v_mise_proteina
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories
        where slug in (
          'proteinas-procesadas-mise-en-place',
          'carnes',
          'cerdos',
          'pollo'
        )
      );
  end if;

  -- Vegetales procesados (cortes/cocciones) -> Mise en place vegetal
  if v_mise_vegetal is not null then
    update public.products
    set category_id = v_mise_vegetal
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories
        where slug in (
          'vegetales-procesados-cortes-y-cocciones',
          'cortes-listos-iv-gama',
          'vegetales-cocidos'
        )
      );
  end if;

  -- Bases de Repostería y Rellenos + Cremas + Rellenos de fruta -> Cremas y rellenos dulces
  if v_cremas_rellenos is not null then
    update public.products
    set category_id = v_cremas_rellenos
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories
        where slug in (
          'bases-de-reposteria-y-rellenos',
          'cremas',
          'rellenos-de-fruta'
        )
      );
  end if;

  -- Coberturas y salsas dulces + Jarabes -> Salsas y coulis dulces
  if v_salsas_coulis is not null then
    update public.products
    set category_id = v_salsas_coulis
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories
        where slug in (
          'coberturas-y-salsas-dulces',
          'jarabes'
        )
      );
  end if;

  -- Toppings e inclusiones dulces -> Toppings, crumbles y decoraciones
  if v_toppings is not null then
    update public.products
    set category_id = v_toppings
    where product_type = 'preparacion'
      and category_id in (
        select id from public.product_categories
        where slug = 'toppings-e-inclusiones-dulces'
      );
  end if;

end $$;

-- 2) Eliminar categorías legacy de preparaciones (WIP antiguo).
--    Regla: applies_to_kinds incluye 'preparacion' y el slug NO empieza por 'preparacion-' ni 'preparaciones-'.

delete from public.product_categories pc
where applies_to_kinds @> array['preparacion']::text[]
  and coalesce(pc.slug, '') <> ''
  and pc.slug not like 'preparacion-%'
  and pc.slug not like 'preparaciones-%';

commit;

