// ==============================================================================
// vitest.config.ts — Configuration des tests Vitest (unitaires & intégration)
// ==============================================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests unitaires : logique livraison. Tests d'intégration : réservation stock.
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    passWithNoTests: true,
    coverage: {
      reporter: ['text', 'html'],
      include: ['supabase/functions/_shared/**'],
    },
  },
});