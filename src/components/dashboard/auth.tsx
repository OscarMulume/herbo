'use client';

// ==============================================================================
// components/dashboard/auth.tsx — Contexte d'authentification du back-office
// ------------------------------------------------------------------------------
// Fournit la session Supabase (navigateur) aux pages /dashboard, ainsi que les
// opérations signIn / signOut. Extraite du layout afin de rester importable par
// les pages (un fichier `layout.tsx` ne peut exporter que son composant).
// ==============================================================================

import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

/** API d'authentification exposée aux composants du dashboard. */
export interface DashboardAuth {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const DashboardAuthContext = createContext<DashboardAuth | null>(null);

/**
 * Accès au contexte d'authentification du dashboard.
 *
 * @returns Le contexte (session, chargement, signIn, signOut).
 */
export function useDashboardAuth(): DashboardAuth {
  const ctx = useContext(DashboardAuthContext);
  if (!ctx) throw new Error('useDashboardAuth doit être utilisé sous le layout /dashboard');
  return ctx;
}