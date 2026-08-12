// ==============================================================================
// playwright.config.ts — Configuration des tests E2E
// ------------------------------------------------------------------------------
// Projet unique "mobile-chromium" pour valider le parcours réel en viewport
// mobile (390x844, Mobile-First). Le serveur Next.js dev est lancé
// automatiquement (ou réutilisé s'il est déjà actif).
// ==============================================================================

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Faites un passage unique en test manuel ; augmenter pour la CI.
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chromium',
      // Vue mobile (Mobile-First) sur moteur Chromium (navigateur déjà installé).
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    // La page d'accueil réelle est /herbo/ (basePath de l'export statique).
    url: 'http://localhost:3000/herbo/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});