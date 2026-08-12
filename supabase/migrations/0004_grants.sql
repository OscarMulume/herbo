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
