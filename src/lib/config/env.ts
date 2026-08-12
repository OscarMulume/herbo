// ==============================================================================
// lib/config/env.ts — Accès centralisé et validé aux variables d'environnement
// ------------------------------------------------------------------------------
// Règle supra : AUCUNE valeur sensible n'est codée en dur. Tout passe par ici.
// Note de sécurité : le service_role_key / les clés de l'agrégateur ne vivent
// que dans l'environnement des Edge Functions (jamais dans le frontend).
// ==============================================================================

function required(name: string, value: string | undefined): string {
  if (!value) {
    // On signale le manque en dev ; un build avisé échouera explicitement si besoin.
    if (process.env.NODE_ENV !== 'production') {
      // NB : simple avertissement console, aucune valeur sensible affichée.
      console.warn(`[env] Variable d'environnement manquante : ${name}`);
    }
  }
  return value ?? '';
}

// Accès STATIQUE aux variables NEXT_PUBLIC_ : c'est la seule forme que Next.js
// substitue dans le bundle navigateur (process.env[nom] dynamique reste vide côté client).
const template = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_PAYMENT_CALLBACK_URL: process.env.NEXT_PUBLIC_PAYMENT_CALLBACK_URL,
} as const;

/**
 * Clé d'environnement centralisées liées à Supabase (client navigateur).
 * Tous les appels client passent par env.supabaseUrl / env.supabaseAnonKey.
 */
export const env = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', template.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', template.NEXT_PUBLIC_SUPABASE_ANON_KEY),

  /** URL de base de la passerelle des Edge Functions. */
  edgeFunctionsUrl: (function build(): string {
    const url = template.NEXT_PUBLIC_SUPABASE_URL;
    return url ? `${url}/functions/v1` : '';
  })(),

  /** URL de retour après paiement (gérée par une page dédiée). */
  paymentCallbackUrl: required('NEXT_PUBLIC_PAYMENT_CALLBACK_URL', template.NEXT_PUBLIC_PAYMENT_CALLBACK_URL),
} as const;