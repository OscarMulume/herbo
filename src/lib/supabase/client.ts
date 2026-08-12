// ==============================================================================
// lib/supabase/client.ts — Client Supabase côté navigateur
// ------------------------------------------------------------------------------
// Utilisé UNIQUEMENT pour des lectures RLS-protégées et l'appel des Edge
// Functions. Les écritures critiques (commande, paiement) passent TOUTE par les
// Edge Functions, jamais directement par ce client avec la clé publique.
// ==============================================================================

import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/config/env';

/**
 * Retourne le client Supabase unique (singleton) pour le navigateur.
 * La clé anon est publique par conception ; la sécurité réelle repose sur RLS.
 *
 * @returns Un client Supabase connecté aux ressources publiques.
 */
export function createBrowserClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}