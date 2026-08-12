'use client';

// ==============================================================================
// components/theme/ThemeToggle.tsx — Interrupteur de thème ☀️ / 🌙
// ------------------------------------------------------------------------------
// Bascule entre le mode sombre et le mode clair. L'état initial provient de la
// préférence du navigateur (prefers-color-scheme) via next-themes.
// `mounted` évite toute erreur d'hydratation SSR (thème inconnu au premier rendu).
// ==============================================================================

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Bouton d'interrupteur Soleil/Lune.
 *
 * @returns Le bouton de bascule de thème (accessible au clavier).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className="theme-toggle"
    >
      {/* Rendu uniquement après montage pour éviter l'écart SSR. */}
      {mounted ? (isDark ? '🌙' : '☀️') : <span className="theme-toggle-blank" aria-hidden="true" />}
    </button>
  );
}
