'use client';

// ==============================================================================
// components/theme/ThemeProvider.tsx — Fournisseur de thème (Sombre/Clair)
// ------------------------------------------------------------------------------
// Wrapper autour de next-themes : détection automatique de la préférence du
// navigateur (prefers-color-scheme via defaultTheme="system"), persistance du
// choix, et bascule de la classe `dark` sur <html> (stratégie Tailwind).
// ==============================================================================

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Active la gestion de thème pour toute l'application.
 *
 * @param children - Contenu de l'application.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
