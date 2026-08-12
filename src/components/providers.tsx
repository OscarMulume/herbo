'use client';

// ==============================================================================
// components/providers.tsx — Fournisseurs globaux (wrapper client)
// ------------------------------------------------------------------------------
// Agrége les contextes nécessitant une exécution côté client (ici le panier).
// ==============================================================================

import { CartProvider } from '@/components/cart/CartProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import type { ReactNode } from 'react';

/**
 * Enveloppe l'application avec tous les fournisseurs globaux.
 *
 * @param children - Contenu de l'application.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <CartProvider>{children}</CartProvider>
    </ThemeProvider>
  );
}