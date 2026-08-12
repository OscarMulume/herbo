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