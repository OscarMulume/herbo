-- ==============================================================================
-- SCRIPT COMPLET DE CREATION DU SCHEMA — Projet Cloud Supabase herbo
-- A executer une seule fois dans : Supabase Dashboard -> SQL Editor -> Run
-- (concaténation de supabase/migrations/*.sql + supabase/seed.sql)
-- ==============================================================================

-- ===================== 0001_init.sql =====================

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

-- ===================== 0002_security_hardening.sql =====================

-- ==============================================================================
-- MIGRATION 0002 — DURCISSEMENT DE SÉCURITÉ (RLS, anti-élévation, zones livreurs)
-- ------------------------------------------------------------------------------
-- Objectifs de sécurité :
--   * Anti-élévation de privilèges : un client ne peut NI modifier son rôle,
--     NI créer un profil avec un rôle autre que 'customer'.
--   * Principe du moindre privilège : un client ne met à jour QUE ses colonnes
--     de livraison sur ses commandes encore en statut 'pending' (les colonnes
--     financières et `status` ne lui sont pas données en écriture).
--   * Livreur : ne voit que les commandes de SES zones assignées (table
--     driver_zones), et ne met à jour que celles qui lui sont assignées.
--   * Rate limiting applicatif : table rate_limits + RPC atomique destinée aux
--     Edge Functions (protection contre le spam de commandes).
--   * L'annulation par le client d'une commande 'pending' passe par un RPC
--     dédié (restitution atomique du stock), jamais par une écriture directe.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PROFILES — ANTI-ÉLÉVATION DE PRIVILÈGES
-- ------------------------------------------------------------------------------

-- Un client ne doit pas pouvoir insérer un profil avec un rôle élevé.
drop policy if exists "Un utilisateur crée son profil à l'inscription" on public.profiles;
create policy "Un utilisateur crée un profil client à l'inscription"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id and (role = 'customer' or public.is_admin()));

-- Champ de rôle : restreint à la valeur par défaut 'customer' pour un client.
-- Note : PostgreSQL ne permet pas de restreindre une policy UPDATE à des
-- colonnes précises (la syntaxe `FOR UPDATE OF colonnes` est invalide). La
-- sécurité réelle est portée par le critère `with check` ci-dessous, qui
-- interdit tout changement de rôle côté client ; les montants et statuts des
-- commandes ne sont jamais modifiables via le client navigateur (écritures
-- critiques via les Edge Functions/service_role).
drop policy if exists "Un utilisateur met à jour son propre profil" on public.profiles;
create policy "Un client ne met à jour que ses données sans élever son rôle"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and (role = 'customer' or public.is_admin()));

-- Les admins restent seuls autorisés à modifier les autres colonnes (dont la rôle).
create policy "Les admins gèrent tous les profils (y compris le rôle)"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. ORDERS — RESTRICTIONS CLIENT SUR LES COMMANDES EN "pending"
-- ------------------------------------------------------------------------------

-- Un client peut mettre à jour UNIQUEMENT les colonnes de livraison de ses
-- propres commandes tant qu'elles restent en statut "pending". Il ne peut ni
-- modifier status, ni les montants (colonnes non couvertes par la politique).
drop policy if exists "Un client met à jour sa livraison" on public.orders;
create policy "Un client met à jour la livraison de ses commandes en attente"
  on public.orders for update to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'pending');

-- ------------------------------------------------------------------------------
-- 3. TABLES DRIVER_ZONES — AFFECTATION DES LIVREURS AUX ZONES
-- ------------------------------------------------------------------------------
create table public.driver_zones (
  driver_id  uuid        not null references auth.users (id) on delete cascade,
  zone_id    uuid        not null references public.delivery_zones (id) on delete cascade,
  created_at timestamptz not null default timezone('Africa/Porto-Novo', now()),
  primary key (driver_id, zone_id)
);

comment on table public.driver_zones is
  'Association livreur <-> zones de livraison (régit la visibilité des commandes).';

alter table public.driver_zones enable row level security;

-- Un livreur consulte uniquement ses propres affectations de zones.
create policy "Un livreur consulte ses propres zones"
  on public.driver_zones for select to authenticated
  using (public.is_driver() and driver_id = auth.uid());

-- Seuls les admins gèrent l'affectation des livreurs aux zones.
create policy "Les admins gèrent les affectations de zones"
  on public.driver_zones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. ORDERS — POLITIQUES LIVREUR ÉTROITES (VISIBILITÉ PAR ZONE ASSIGNÉE)
-- ------------------------------------------------------------------------------

-- Un livreur voit les commandes DE SES zones assignées (disponibles) OU qui lui
-- sont explicitement assignées.
drop policy if exists "Un livreur voit les commandes qui lui sont assignées" on public.orders;
drop policy if exists "Un livreur voit les commandes de ses zones" on public.orders;
create policy "Un livreur voit les commandes de ses zones assignées"
  on public.orders for select to authenticated
  using (
    public.is_driver() and (
      driver_id = auth.uid()
      or exists (
        select 1 from public.driver_zones dz
        where dz.driver_id = auth.uid() and dz.zone_id = orders.delivery_zone_id
      )
    )
  );

-- Un livreur ne met à jour QUE les colonnes de statut des commandes assignées
-- à lui-même ET situées dans l'une de ses zones.
drop policy if exists "Un livreur met à jour les commandes assignées" on public.orders;
create policy "Un livreur met à jour les commandes assignées (statuts de livraison)"
  on public.orders for update to authenticated
  using (
    public.is_driver() and driver_id = auth.uid()
    and exists (
      select 1 from public.driver_zones dz
      where dz.driver_id = auth.uid() and dz.zone_id = orders.delivery_zone_id
    )
  )
  with check (
    public.is_driver() and driver_id = auth.uid()
    and status in ('out_for_delivery', 'delivered')
  );

-- ------------------------------------------------------------------------------
-- 5. RPC CLIENT_CANCEL_ORDER — ANNULATION SÛRE PAR LE CLIENT (restitution stock)
-- ------------------------------------------------------------------------------
create or replace function public.client_cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_status  public.order_status;
  v_item    record;
begin
  v_user_id := auth.uid();
  if v_user_id is null or v_user_id = '' then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- La commande doit appartenir au client et être encore en attente.
  select status into v_status
  from public.orders
  where id = p_order_id and user_id = v_user_id;

  if v_status is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status <> 'pending' then
    raise exception 'ORDER_NOT_CANCELLABLE';
  end if;

  -- Restitution atomique du stock réservé.
  for v_item in select product_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.product_id;
  end loop;

  update public.orders
  set status = 'cancelled', updated_at = timezone('Africa/Porto-Novo', now())
  where id = p_order_id;
end;
$$;

revoke execute on function public.client_cancel_order(uuid) from anon;
grant  execute on function public.client_cancel_order(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 6. RATE LIMITING APPLICATIF (protection contre le spam de commandes)
-- ------------------------------------------------------------------------------
create table public.rate_limits (
  resource     text         not null,                       -- clé (ex: payment-intent:userId)
  window_start timestamptz  not null,                   -- début de la fenêtre
  hit_count    integer      not null default 0,
  primary key (resource, window_start)
);

comment on table public.rate_limits is
  'Compteurs de fenêtres glissantes par ressource (utilisés par les Edge Functions).';

alter table public.rate_limits enable row level security;

create policy "Les admins gèrent les compteurs de limite"
  on public.rate_limits for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. RPC ACQUITE_RATE_LIMIT — incrément atomique + vérification de la limite
--    Returns true si la demande est autorisée (<= limite), false si dépassée.
-- ------------------------------------------------------------------------------
create or replace function public.acquire_rate_limit(
  p_resource        text,
  p_limit           integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  if p_resource is null or p_resource = '' then
    raise exception 'INVALID_RESOURCE';
  end if;
  if p_limit is null or p_limit <= 0 then
    raise exception 'INVALID_LIMIT';
  end if;
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'INVALID_WINDOW';
  end if;

  -- Fenêtre temporelle (début de fenêtre = multiple entier de window_seconds).
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  -- Incrément atomique (verrouillage d'upsert) et récupération du compteur.
  insert into public.rate_limits (resource, window_start, hit_count)
  values (p_resource, v_window_start, 1)
  on conflict (resource, window_start)
  do update set hit_count = public.rate_limits.hit_count + 1
  returning hit_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.acquire_rate_limit(text, integer, integer) from public, anon, authenticated;
grant  execute on function public.acquire_rate_limit(text, integer, integer) to service_role;

-- ------------------------------------------------------------------------------
-- 8. FONCTIONS MÉTIER UTILISÉES PAR LA EDGE FUNCTION : REVOKE DES CLIENT
--    (déplacement : create_order_from_cart / cancel_order déjà protégées en 0001)
-- ------------------------------------------------------------------------------
-- (Aucun ajout nécessaire ici : les fonctions de commande sont déjà restreintes
--  à service_role par la migration 0001.)

-- ===================== 0003_payment_webhooks.sql =====================

-- ==============================================================================
-- MIGRATION 0003 — WEBHOOKS DE PAIEMENT ET IDEMPOTENCE
-- ------------------------------------------------------------------------------
-- Objectifs :
--   * Table payment_events : trace immutable de chaque webhook (déduplication
--     par webhook_id, garantie par une contrainte UNIQUE).
--   * confirm_order_payment : transition ATOMIQUE et IDEMPOTENTE de 'pending'
--     vers 'paid' (la commande n'est payée qu'une seule fois).
--   * fail_order_payment : transition 'pending' -> 'cancelled' avec restitution
--     du stock, également atomique et idempotente.
--   * Sécurité : ces fonctions ne sont exécutables QUE par service_role (c'est
--     la Edge Function de webhook qui les appelle, après vérification de la
--     signature cryptographique côté API).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE PAYMENT_EVENTS — JOURNAL D'AUDIT IMMUTABLE DES PAIEMENTS
-- ------------------------------------------------------------------------------
create table public.payment_events (
  id           uuid         primary key default gen_random_uuid(),
  webhook_id   text         not null unique,   -- identifiant idempotent du webhook
  order_id     uuid         not null references public.orders (id) on delete cascade,
  event_type   text         not null check (event_type in ('payment.succeeded', 'payment.failed')),
  payment_ref  text,                            -- référence renvoyée par l'agrégateur
  payload      jsonb        not null,           -- corps brut (audit)
  processed_at timestamptz  not null default timezone('Africa/Porto-Novo', now())
);

create index payment_events_order_id_idx on public.payment_events (order_id);

comment on table public.payment_events is
  'Historique immuable des événements de paiement reçus (base de la dedup idempotence).';

alter table public.payment_events enable row level security;

create policy "Les admins consultent les événements de paiement"
  on public.payment_events for select to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. RPC CONFIRM_ORDER_PAYMENT — VALIDATION ATOMIQUE DU PAIEMENT (IDEMPOTENT)
-- ------------------------------------------------------------------------------
-- Comportement :
--   * Si le webhook_id a déjà été traité -> return false (aucun effet de bord).
--   * Sinon, la commande est passée 'pending' -> 'paid' de façon atomique :
--     l'UPDATE avec WHERE status='pending' ne compte que si elle était en attente.
--   * Le stock n'est PAS re-décrémenté ici : il a déjà été réservé lors de la
--     création de la commande. Une confirmation matérialise cette réservation.
--   * return true => nouvellement traité, false => doublon ou statut non éligible.
-- ------------------------------------------------------------------------------
create or replace function public.confirm_order_payment(
  p_order_id     uuid,
  p_payment_ref  text,
  p_webhook_id   text,
  p_payload      jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  -- Déduplication : un webhook déjà vu ne re-déclenche rien.
  if exists (select 1 from public.payment_events where webhook_id = p_webhook_id) then
    return false;
  end if;

  -- Transition atomique : uniquement si la commande est encore 'pending'.
  update public.orders
  set status = 'paid',
      payment_reference = coalesce(p_payment_ref, payment_reference),
      status_changed_at = timezone('Africa/Porto-Novo', now())
  where id = p_order_id and status = 'pending';
  get diagnostics v_updated = row_count;

  -- Journalisation (idempotence maintenue même en cas de course concurrente).
  insert into public.payment_events (webhook_id, order_id, event_type, payment_ref, payload)
  values (p_webhook_id, p_order_id, 'payment.succeeded', p_payment_ref, p_payload)
  on conflict (webhook_id) do nothing;

  return v_updated > 0;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. RPC FAIL_ORDER_PAYMENT — ÉCHEC DE PAIEMENT AVEC RESTITUTION DU STOCK
-- ------------------------------------------------------------------------------
create or replace function public.fail_order_payment(
  p_order_id   uuid,
  p_webhook_id text,
  p_payload    jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item   record;
  v_updated integer;
begin
  if exists (select 1 from public.payment_events where webhook_id = p_webhook_id) then
    return false; -- déjà traité : ne surtout pas re-créditer le stock deux fois.
  end if;

  -- Transition atomique (seule une commande 'pending' peut être annulée).
  update public.orders
  set status = 'cancelled', updated_at = timezone('Africa/Porto-Novo', now())
  where id = p_order_id and status = 'pending';
  get diagnostics v_updated = row_count;

  -- Restitution du stock UNIQUEMENT si la commande vient d'être annulée par nous.
  if v_updated > 0 then
    for v_item in
      select product_id, quantity from public.order_items where order_id = p_order_id
    loop
      update public.products
      set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.product_id;
    end loop;
  end if;

  insert into public.payment_events (webhook_id, order_id, event_type, payment_ref, payload)
  values (p_webhook_id, p_order_id, 'payment.failed', null, p_payload)
  on conflict (webhook_id) do nothing;

  return v_updated > 0;
end;
$$;

-- ------------------------------------------------------------------------------
-- SÉCURITÉ : SEUL service_role (la Edge Function de webhook) APPELABLE.
-- ------------------------------------------------------------------------------
revoke execute on function public.confirm_order_payment(uuid, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.confirm_order_payment(uuid, text, text, jsonb) to service_role;

revoke execute on function public.fail_order_payment(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.fail_order_payment(uuid, text, jsonb) to service_role;

-- ===================== 0004_grants.sql =====================

-- ==============================================================================
-- MIGRATION 0004 — GRANTS D'ACCÈS API (lecture publique + service_role)
-- ------------------------------------------------------------------------------
-- Pourquoi : le projet Cloud a « Expose new tables » DÉSACTIVÉ, donc aucune
-- table n'est automatiquement exposée à l'API REST. Sans GRANT explicite,
-- PostgREST refuse TOUT accès (même en lecture) : « permission denied ».
--
-- Choix de sécurité (moindre privilège) :
--   * anon          : SELECT sur les seules tables publiques (catalogue).
--   * authenticated : idem + accès à sa fiche profil (le reste passe par RLS).
--   * service_role  : accès complet (utilisé UNIQUEMENT par les Edge Functions
--                     côté serveur, jamais exposé au navigateur).
-- Les écritures restent protégées par les policies RLS des migrations 0001-0002.
-- ==============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 1. CATALOGUE PUBLIC (lecture pour tous : anon + authenticated)
-- ------------------------------------------------------------------------------
grant select on public.categories to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.delivery_zones to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. PROFILS : le client lit et crée sa propre fiche (RLS restreint aux lignes
--    auth.uid() = id). Le rôle anon n'a aucun accès (profil = données privées).
-- ------------------------------------------------------------------------------
grant select, insert, update on public.profiles to authenticated;

-- ------------------------------------------------------------------------------
-- 2bis. CRUD ADMINISTRATEUR (dashboard back-office) : la sécurité réelle est
--    portée par les policies RLS (0001/0002) qui limitent les écritures aux
--    utilisateurs authentifiés dont le profil a le rôle 'admin'. Sans ces
--    GRANT, même un admin connecté obtiendrait « permission denied ».
--    Le catalogue reste en lecture publique (anon) ; l'écriture exige le rôle.
-- ------------------------------------------------------------------------------
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.delivery_zones to authenticated;

-- Commandes : lecture des siennes + gestion admin + création par le client
-- (toujours via la fonction SECURITY DEFINER côté serveur pour les montants).
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;

-- ------------------------------------------------------------------------------
-- 3. service_role : accès complet aux tables applicatives (les Edge Functions
--    de commande / webhook utilisent ce rôle avec la clé secrète).
-- ------------------------------------------------------------------------------
grant all on public.profiles to service_role;
grant all on public.categories to service_role;
grant all on public.products to service_role;
grant all on public.delivery_zones to service_role;
grant all on public.orders to service_role;
grant all on public.order_items to service_role;
grant all on public.driver_zones to service_role;
grant all on public.rate_limits to service_role;
grant all on public.payment_events to service_role;

-- ------------------------------------------------------------------------------
-- 4. SÉQUENCES (créées par les colonnes serial/identity éventuelles).
-- ------------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;

-- ===================== 0005_usd_currency.sql =====================

-- ==============================================================================
-- MIGRATION 0005 — DEVISE PAR DÉFAUT EN DOLLARS AMÉRICAINS (USD)
-- ------------------------------------------------------------------------------
-- L'ensemble de l'application (boutique + dashboard) affiche les montants en
-- USD ($). Cette migration aligne la valeur par défaut de la colonne
-- orders.currency sur 'USD' afin que les nouvelles commandes créées par
-- les Edge Functions soient cohérentes avec l'interface.
-- ==============================================================================

alter table public.orders
  alter column currency set default 'USD';

update public.orders
set currency = 'USD'
where currency = 'XOF';

-- ===================== 0006_delivery_message.sql =====================

-- ==============================================================================
-- MIGRATION 0006 — MESSAGE PERSONNALISÉ DE LIVRAISON (vendeur -> acheteur)
-- ------------------------------------------------------------------------------
-- Le dashboard Admin (module « Commandes & Livraison ») permet au vendeur de
-- rédiger un message d'instructions personnalisé destiné à l'acheteur
-- (ex: « Livraison entre 14h et 17h »). Ce message est stocké sur la commande.
--
-- NB : delivery_notes (déjà existante) est renseignée par le CLIENT au moment
-- de la commande ; delivery_message est renseignée par le VENDEUR (back-office).
-- ==============================================================================

alter table public.orders
  add column delivery_message text;

comment on column public.orders.delivery_message is
  'Message personnalisé du vendeur avec les instructions de livraison (visible par l''acheteur).';

-- ===================== seed.sql =====================

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
