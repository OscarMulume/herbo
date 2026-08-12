// ==============================================================================
// lib/supabase/server.ts — Client Supabase côté serveur (App Router)
// ------------------------------------------------------------------------------
// Utilisé uniquement pour les LECTURES via les dépôts (Pattern Repository).
// Les opérations d'écriture sensibles sont déléguées aux Edge Functions.
// On suit le patron officiel Supabase (set/remove enveloppés d'un try/catch)
// car les Server Components sont en lecture seule au niveau des cookies.
// ==============================================================================

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/config/env';

/**
 * Crée un client Supabase côté serveur, dont la session est rattachée aux
 * cookies de la requête en cours (Next.js App Router).
 *
 * @returns Un client Supabase authentifié par la session du visiteur.
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      // Lecture : toujours autorisée.
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      // Écriture : possible dans une route handler / action serveur uniquement.
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // NB : ignoré silencieusement lors du rendu SSR en lecture seule.
        }
      },
      // Suppression d'un cookie de session (comportement symétrique à set).
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // NB : ignoré silencieusement lors du rendu SSR en lecture seule.
        }
      },
    },
  });
}