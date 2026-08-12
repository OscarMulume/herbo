-- ==============================================================================
-- SEED — DONNÉES DE DÉMONSTRATION (catégorie + articles + zone de livraison)
-- ------------------------------------------------------------------------------
-- Exécuté par `supabase db reset` (ou `supabase start` au premier lancement).
-- Idempotent : chaque insertion est protégée par ON CONFLICT / WHERE NOT EXISTS
-- pour pouvoir être rejouée sans dupliquer les données.
-- Devise affichée : Dollar Américain (USD, $).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CATÉGORIE DE DÉMONSTRATION
-- ------------------------------------------------------------------------------
insert into public.categories (name, slug, description, is_active)
values (
  'Produits du moment',
  'produits-du-moment',
  'Articles phares actuellement disponibles.',
  true
)
on conflict (slug) do nothing;

-- ------------------------------------------------------------------------------
-- 2. ARTICLES DE DÉMONSTRATION (3 articles, prix $1 / $10 / $10)
-- ------------------------------------------------------------------------------
insert into public.products (
  category_id, name, slug, description, benefits, dosage,
  price, stock_quantity, images, is_active, is_featured, weight_grams
)
select
  c.id,
  'Herbe de citronnelle',
  'herbe-citronnelle',
  'Plante aromatique fraîche de démonstration.',
  'Infusion agréable, arôme naturel.',
  '1 poignée en infusion pour une thé.',
  1,
  100,
  '{}',
  true,
  true,
  50
from public.categories c
where c.slug = 'produits-du-moment'
on conflict (slug) do nothing;

insert into public.products (
  category_id, name, slug, description, benefits, dosage,
  price, stock_quantity, images, is_active, is_featured, weight_grams
)
select
  c.id,
  'Mélange d''infusion apaisante (un pack)',
  'mélange-infusion-apaisante-pack',
  'Pack de démonstration : mélange de plantes pour infusion.',
  'Boisson chaude relaxante en fin de journée.',
  '1 sachet par tasse, infuser 5 minutes.',
  10,
  50,
  '{}',
  true,
  true,
  250
from public.categories c
where c.slug = 'produits-du-moment'
on conflict (slug) do nothing;

insert into public.products (
  category_id, name, slug, description, benefits, dosage,
  price, stock_quantity, images, is_active, is_featured, weight_grams
)
select
  c.id,
  'Échantillon 1/2 dose de fleurs de camomille',
  'echantillon-camomille-1-2-dose',
  'Format découverte 1/2 dose de camomille séchée.',
  'Petit format pour découvrir la camomille.',
  '1 cuillère par tasse, infuser 5 minutes.',
  10,
  50,
  '{}',
  true,
  false,
  25
from public.categories c
where c.slug = 'produits-du-moment'
on conflict (slug) do nothing;

-- ------------------------------------------------------------------------------
-- 3. ZONE DE LIVRAISON DE DÉMONSTRATION (rayon autour du dépôt central de Cotonou)
-- ------------------------------------------------------------------------------
insert into public.delivery_zones (
  name, commune, quartier, city, country, zone_type,
  center_lat, center_lng, radius_km,
  base_fee, per_km_fee, min_order_amount, free_delivery_threshold, is_active
)
select
  'Cotonou Centre',
  'Cotonou',
  'Centre-ville',
  'Cotonou',
  'BJ',
  'radius',
  6.3703,
  2.3912,
  8,
  1,
  0.5,
  0,
  25,
  true
where not exists (
  select 1 from public.delivery_zones
  where city = 'Cotonou' and quartier = 'Centre-ville' and is_active = true
);