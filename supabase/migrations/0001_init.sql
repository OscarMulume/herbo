-- ==============================================================================
-- MIGRATION 0001 — PLATEFORME E-COMMERCE "REMÈDES & PRODUITS DE SANTÉ"
-- PostgreSQL (hébergé sur Supabase)
-- ------------------------------------------------------------------------------
-- FUSE HORAIRE : West Central Africa (UTC+1) => Africa/Porto-Novo.
-- Tous les timestamps sont stockés en TIMESTAMPTZ puis localisés via
-- timezone('Africa/Porto-Novo', now()) afin de rester cohérents en cas de
-- migration vers un autre hébergeur (les TIMESTAMPTZ sont portables).
--
-- BONNES PRATIQUES APPLIQUÉES :
--   * UUID via gen_random_uuid() (pgcrypto, intégré à PostgreSQL 13+).
--   * Row Level Security (RLS) activée sur toutes les tables applicatives.
--   * Fonctions métier SECURITY DEFINER avec search_path verrouillé.
--   * Sécurité renforcée : les fonctions de commande ne sont EXECUTÉES QUE par
--     le rôle service_role (jamais publiquement, ni par un client authentifié).
--   * Polygones GPS stockés en JSONB (portable) au lieu d'exiger PostGIS,
--     ce qui facilite une migration future vers un autre SGBD.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUSEAU HORAIRE PAR DÉFAUT (optionnel si déjà réglé dans le Dashboard)
-- ------------------------------------------------------------------------------
do $$
begin
  execute 'alter database ' || current_database() || ' set timezone to ''Africa/Porto-Novo''';
exception when others then
  null; -- Non bloquant : peut être configuré via les paramètres du projet.
end $$;

-- ------------------------------------------------------------------------------
-- 2. TYPE ÉNUMÉRÉ — STATUTS DE COMMANDE
-- ------------------------------------------------------------------------------
create type public.order_status as enum (
  'pending',            -- En attente de paiement (les articles sont réservés)
  'paid',               -- Paiement confirmé par webhook
  'processing',         -- Préparation en cours (back-office)
  'out_for_delivery',   -- Assigné au livreur et en cours de livraison
  'delivered',          -- Livré au client
  'cancelled'           -- Annulé => le stock est restitué
);

-- ------------------------------------------------------------------------------
-- 3. TABLE PROFILES — PROFILS CLIENTS / LIVREURS / ADMINS
--    Représente le prolongement applicatif de la table "auth.users" (Supabase).
-- ------------------------------------------------------------------------------
create table public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  role        text        not null default 'customer'
                          check (role in ('customer', 'driver', 'admin')),
  avatar_url  text,
  created_at  timestamptz not null default timezone('Africa/Porto-Novo', now()),
  updated_at  timestamptz not null default timezone('Africa/Porto-Novo', now())
);

comment on table public.profiles is
  'Profils utilisateurs (client, livreur, admin) liés à l''authentification Supabase.';

-- ------------------------------------------------------------------------------
-- 4. TABLE CATEGORIES — HIÉRARCHIE DES PRODUITS (auto-référencement).
-- ------------------------------------------------------------------------------
create table public.categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        not null unique,
  description text,
  parent_id   uuid        references public.categories (id) on delete set null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default timezone('Africa/Porto-Novo', now()),
  updated_at  timestamptz not null default timezone('Africa/Porto-Novo', now())
);

create index categories_parent_id_idx on public.categories (parent_id);

comment on table public.categories is
  'Catégories hiérarchiques (ex: "Huiles essentielles" -> parent de "Eucalyptus").';

-- -----------------------------------------------------------------------------
-- 5. TABLE PRODUCTS — CATALOGUE PRODUITS ARTISANAUX
-- -----------------------------------------------------------------------------
create table public.products (
  id             uuid          primary key default gen_random_uuid(),
  category_id    uuid          not null references public.categories (id) on delete restrict,
  name           text          not null,
  slug           text          not null unique,
  description    text,                 -- Description commerciale
  benefits       text,                 -- Bienfaits thérapeutiques / usages
  dosage         text,                 -- Posologie et précautions
  price          numeric(12,2) not null check (price >= 0),
  stock_quantity integer       not null default 0 check (stock_quantity >= 0),
  images         text[]        not null default '{}',  -- URL Supabase Storage (HD)
  is_active      boolean       not null default true,  -- Suppression logique (soft delete)
  is_featured    boolean       not null default false,
  weight_grams   numeric(10,2) not null default 0 check (weight_grams >= 0),
  created_at     timestamptz   not null default timezone('Africa/Porto-Novo', now()),
  updated_at     timestamptz   not null default timezone('Africa/Porto-Novo', now())
);

create index products_category_id_idx on public.products (category_id);
create index products_is_active_idx    on public.products (is_active);

comment on table public.products is
  'Catalogue des produits artisanaux avec gestion du stock et du poids.';

-- -----------------------------------------------------------------------------
-- 6. TABLE DELIVERY_ZONES — ZONES DE LIVRAISON ET TARIFICATION DYNAMIQUE
--    Une zone est définie soit par un rayon kilométrique (radius), soit par un
--    polygone GPS (GeoJSON). Les frais sont calculés dans la Edge Function.
-- -----------------------------------------------------------------------------
create table public.delivery_zones (
  id                     uuid      primary key default gen_random_uuid(),
  name                   text      not null,            -- ex: "Cotonou Centre"
  commune                text,                         -- ex. commune
  quartier               text,                         -- ex. quartier
  city                   text      not null,
  country                text      not null default 'BJ',
  zone_type              text      not null default 'radius'
                                    check (zone_type in ('polygon', 'radius')),
  center_lat             double precision,             -- centre du rayon
  center_lng             double precision,
  radius_km              numeric(8,2),                 -- rayon kilométrique
  polygon_geojson        jsonb,                        -- polygone GPS (GeoJSON)
  base_fee               numeric(12,2) not null default 0 check (base_fee >= 0),
  per_km_fee             numeric(12,2) not null default 0 check (per_km_fee >= 0),
  min_order_amount       numeric(12,2) not null default 0 check (min_order_amount >= 0),
  free_delivery_threshold numeric(12,2) not null default 0 check (free_delivery_threshold >= 0),
  is_active              boolean     not null default true,
  created_at             timestamptz not null default timezone('Africa/Porto-Novo', now()),
  updated_at             timestamptz not null default timezone('Africa/Porto-Novo', now()),
  -- Contrainte de cohérence selon le type de zone.
  constraint delivery_zone_radius_check check (
    (zone_type = 'radius' and center_lat is not null and center_lng is not null and radius_km is not null)
    or (zone_type = 'polygon' and polygon_geojson is not null)
  )
);

create index delivery_zones_is_active_idx on public.delivery_zones (is_active);

comment on table public.delivery_zones is
  'Zones de livraison (rayon km ou polygone GPS) avec tarification dynamique.';

-- -----------------------------------------------------------------------------
-- 7. TABLE ORDERS — COMMANDES
--    La position GPS de livraison est OBLIGATOIRE (adresses non standardisées).
-- -----------------------------------------------------------------------------
create table public.orders (
  id                       uuid          primary key default gen_random_uuid(),
  order_number             text          not null unique,   -- numéro lisible client
  user_id                  uuid          not null references auth.users (id) on delete cascade,
  status                   public.order_status not null default 'pending',
  items_total              numeric(12,2) not null check (items_total >= 0),
  delivery_fee             numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total_amount             numeric(12,2) not null check (total_amount >= 0),
  currency                 text          not null default 'XOF',
  payment_method           text          not null default 'mobile_money'
                                          check (payment_method in ('mobile_money', 'card', 'cash_on_delivery')),
  payment_reference        text,                 -- référence retournée par l'agrégateur
  delivery_zone_id         uuid          references public.delivery_zones (id) on delete set null,
  driver_id                uuid          references auth.users (id) on delete set null,
  delivery_address         text          not null,
  delivery_lat             double precision not null,
  delivery_lng             double precision not null,
  delivery_notes           text,
  status_changed_at        timestamptz,
  created_at               timestamptz   not null default timezone('Africa/Porto-Novo', now()),
  updated_at               timestamptz   not null default timezone('Africa/Porto-Novo', now())
);

create index orders_user_id_idx      on public.orders (user_id);
create index orders_driver_id_idx    on public.orders (driver_id);
create index orders_status_idx       on public.orders (status);
create index orders_delivery_zone_idx on public.orders (delivery_zone_id);

comment on column public.orders.delivery_lat is 'Latitude GPS du point de livraison';
comment on column public.orders.delivery_lng is 'Longitude GPS du point de livraison';

-- -----------------------------------------------------------------------------
-- 8. TABLE ORDER_ITEMS — HISTORIQUE DES LIGNES AU PRIX D'ACHAT
--    Le prix est figé (snapshot) ; les changements de prix du catalogue n'ont
--    aucun impact rétroactif sur les commandes déjà passées.
-- -----------------------------------------------------------------------------
create table public.order_items (
  id           uuid          primary key default gen_random_uuid(),
  order_id     uuid          not null references public.orders (id) on delete cascade,
  product_id   uuid          not null references public.products (id) on delete restrict,
  product_name text          not null,                 -- snapshot du nom
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  quantity     integer       not null check (quantity > 0),
  subtotal     numeric(12,2) not null check (subtotal >= 0),
  created_at   timestamptz   not null default timezone('Africa/Porto-Novo', now())
);

create index order_items_order_id_idx   on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- -----------------------------------------------------------------------------
-- 9. TRIGGERS — METÀ-JOUR DE updated_at (AUTOMATIQUE)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := timezone('Africa/Porto-Novo', now());
  return new;
end;
$$;

create trigger trg_profiles_updated_at     before update on public.profiles      for each row execute function public.set_updated_at();
create trigger trg_categories_updated_at   before update on public.categories    for each row execute function public.set_updated_at();
create trigger trg_products_updated_at     before update on public.products      for each row execute function public.set_updated_at();
create trigger trg_delivery_zones_updated  before update on public.delivery_zones for each row execute function public.set_updated_at();
create trigger trg_orders_updated_at       before update on public.orders        for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 10. TRIGGER — CRÉATION DU PROFIL À L'INSCRIPTION UTILISATEUR
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 11. RLS — FONCTIONS D'AIDE AUX POLITIQUES
--     (SECURITY DEFINER pour éviter les boucles de récursion sur profiles)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_driver()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver'
  );
$$;

-- =============================================================================
-- 12. POLITICIQUES DE SÉCURITÉ AU NIVEAU DES LIGNES (RLS)
-- =============================================================================

-- ---------- 12.1 PROFILES ----------
alter table public.profiles enable row level security;

create policy "Un utilisateur crée son profil à l'inscription"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Un utilisateur ne voit que son propre profil"
  on public.profiles for select to authenticated
  using (auth.uid() = id or public.is_admin());

create policy "Un utilisateur met à jour son propre profil"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id or public.is_admin());

-- ---------- 1.2 CATEGORIES ----------
alter table public.categories enable row level security;

create policy "Les catégories actives sont visibles par tous"
  on public.categories for select to anon, authenticated
  using (is_active = true or public.is_admin());

create policy "Les admins gèrent les catégories"
  on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 1.3 PRODUCTS ----------
alter table public.products enable row level security;

-- Exemple n°1 : les produits actifs sont visibles par tous (lecture publique).
create policy "Les produits actifs sont visibles par tous"
  on public.products for select to anon, authenticated
  using (is_active = true or public.is_admin());

create policy "Les admins gèrent les produits"
  on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 1.4 DELIVERY_ZONES ----------
alter table public.delivery_zones enable row level security;

create policy "Les zones actives sont visibles par tous"
  on public.delivery_zones for select to anon, authenticated
  using (is_active = true or public.is_admin());

create policy "Les admins gèrent les zones"
  on public.delivery_zones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 1.5 ORDERS ----------
alter table public.orders enable row level security;

-- Exemple n°2 : un client ne voit QUE ses propres commandes.
create policy "Un client ne voit que ses propres commandes"
  on public.orders for select to authenticated
  using (auth.uid() = user_id);

-- Un livreur voit les commandes qui lui sont assignées (dispatching).
create policy "Un livreur voit les commandes qui lui sont assignées"
  on public.orders for select to authenticated
  using (auth.uid() = driver_id);

-- Les admins (back-office) voient toutes les commandes.
create policy "Les admins voient toutes les commandes"
  on public.orders for select to authenticated
  using (public.is_admin());

-- Un client initialise sa commande (le statut réel est géré par la fonction métier).
create policy "Un client crée ses propres commandes"
  on public.orders for insert to authenticated
  with check (auth.uid() = user_id);

-- Un livreur met à jour les commandes assignées (statuts de livraison).
create policy "Un livreur met à jour les commandes assignées"
  on public.orders for update to authenticated
  using (public.is_driver() and auth.uid() = driver_id) with check (true);

-- Les admins mettent à jour toutes les commandes (assignations, statuts).
create policy "Les admins mettent à jour toutes les commandes"
  on public.orders for update to authenticated
  using (public.is_admin()) with check (true);

-- ---------- 1.6 ORDER_ITEMS ----------
alter table public.order_items enable row level security;

-- Exemple n°3 : les articles suivent la visibilité de leur commande.
-- Un client ne peut lire les articles que d'une commande qui lui appartient.
create policy "Les articles suivent la visibilité de leur commande"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = auth.uid() or o.driver_id = auth.uid() or public.is_admin())
    )
  );

create policy "Les admins gèrent les articles"
  on public.order_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- 13. FONCTIONS MÉTIER (SECURITY DEFINER)
--     Réservation atomique du stock + création de la commande + historique.
--     --------
--     Ces fonctions ne sont EXECUTÉES QUE par service_role (l'Egde Function),
--     JAMAIS par un client. Ainsi un utilisateur ne peut pas manipuler le prix
--     des frais de livraison ni court-circuiter la réservation du stock.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_order_from_cart
--   * Réserve le stock de chaque produit (verrou SELECT ... FOR UPDATE).
--   * Calcule le sous-total (source journalistique de vérité).
--   * Insère la commande (statut 'pending') et son historique d'articles.
--   * Retourne un JSON (order_id, order_number, items_total, delivery_fee,
--     total_amount, currency) utilisé ensuite par l'Egde Function pour créer
--     l'intention de paiement chez l'agrégateur.
-- -----------------------------------------------------------------------------
create or replace function public.create_order_from_cart(
  p_user_id            uuid,
  p_items              jsonb,            -- [{product_id, quantity}]
  p_delivery_zone_id   uuid,
  p_delivery_fee       numeric,
  p_delivery_lat       double precision,
  p_delivery_lng       double precision,
  p_delivery_address   text,
  p_delivery_notes     text default null,
  p_payment_method     text default 'mobile_money'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item       jsonb;
  v_product    record;
  v_quantity   integer;
  v_items_total numeric(12,2) := 0;
  v_total      numeric(12,2);
  v_order_id   uuid;
  v_order_number text;
begin
  -- Garde-fous d'entrée
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if p_delivery_fee is null or p_delivery_fee < 0 then
    raise exception 'INVALID_DELIVERY_FEE';
  end if;

  -- La zone doit exister et être active
  perform 1 from public.delivery_zones dz
  where dz.id = p_delivery_zone_id and dz.is_active = true;
  if not found then
    raise exception 'DELIVERY_ZONE_INVALID';
  end if;

  -- 1) Boucle sur les articles : contrôle du stock + réservation atomique.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity') :: integer;
    if v_quantity <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id') :: uuid and is_active = true
    for update;  -- verrouillage de ligne: évite les sur-ventes concurrentes

    if not found then
      raise exception 'PRODUCT_NOT_FOUND:%', (v_item ->> 'product_id');
    end if;

    if v_product.stock_quantity < v_quantity then
      raise exception 'INSUFFICIENT_STOCK:%', v_product.id;
    end if;

    -- Déstockage (réservation) dans la même transaction.
    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product.id;

    v_items_total := v_items_total + (v_product.price * v_quantity);
  end loop;

  v_total := v_items_total + coalesce(p_delivery_fee, 0);

  -- Numéro de commande lisible par le client.
  v_order_number := 'CMD-' || to_char(timezone('Africa/Porto-Novo', now()), 'YYYYMMDD')
                    || '-' || upper(substr(md5(random()::text), 1, 6));

  -- 2) Insérer la commande.
  insert into public.orders (
    order_number, user_id, status, items_total, delivery_fee, total_amount,
    currency, payment_method, delivery_zone_id, delivery_lat, delivery_lng,
    delivery_address, delivery_notes
  ) values (
    v_order_number, p_user_id, 'pending', v_items_total, coalesce(p_delivery_fee, 0),
    v_total, 'USD', p_payment_method, p_delivery_zone_id, p_delivery_lat,
    p_delivery_lng, p_delivery_address, p_delivery_notes
  )
  returning id into v_order_id;

  -- 3) Historiser les articles au prix du moment de l'achat.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.products where id = (v_item ->> 'product_id') :: uuid;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (
      v_order_id, v_product.id, v_product.name, v_product.price,
      (v_item ->> 'quantity') :: integer,
      v_product.price * (v_item ->> 'quantity') :: integer
    );
  end loop;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'order_number', v_order_number,
    'items_total',  v_items_total,
    'delivery_fee', coalesce(p_delivery_fee, 0),
    'total_amount', v_total,
    'currency', 'USD'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 13bis. ANNULATION DE COMMANDE + RESTITUTION DU STOCK
--        Appelée par la Edge Function de webhook en cas d'échec de paiement.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.order_status;
  v_item   record;
begin
  select status into v_status from public.orders where id = p_order_id;
  if v_status is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- Seules les commandes non payées peuvent être annulées.
  if v_status not in ('pending') then
    raise exception 'ORDER_NOT_CANCELLABLE';
  end if;

  -- Restitution du stock réservé.
  for v_item in select product_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.product_id;
  end loop;

  update public.orders set status = 'cancelled', updated_at = timezone('Africa/Porto-Novo', now())
  where id = p_order_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- SÉCURITÉ : SEUL service_role PEUT APPELER CES FONCTIONS.
-- (Empêche un client authentifié de créer une commande en fixant delivery_fee=0)
-- -----------------------------------------------------------------------------
revoke execute on function public.create_order_from_cart(uuid, jsonb, uuid, numeric, double precision, double precision, text, text, text) from public, anon, authenticated;
grant  execute on function public.create_order_from_cart(uuid, jsonb, uuid, numeric, double precision, double precision, text, text, text) to service_role;

revoke execute on function public.cancel_order(uuid) from public, anon, authenticated;
grant  execute on function public.cancel_order(uuid) to service_role;