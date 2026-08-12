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