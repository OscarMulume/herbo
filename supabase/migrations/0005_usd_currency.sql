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