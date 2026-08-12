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
