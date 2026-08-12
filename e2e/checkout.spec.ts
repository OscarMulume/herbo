// ==============================================================================
// e2e/checkout.spec.ts — Parcours d'achat complet (E2E)
// ------------------------------------------------------------------------------
// Scénario : l'utilisateur arrive sur le storefront, ajoute un produit au panier
// (optimistic UI), accède au checkout, fournit son adresse, choisit sa position
// GPS sur la carte (géolocalisation simulée), sélectionne un mode de paiement,
// puis valide jusqu'à l'écran de confirmation.
//
// La suite est HERMÉTIQUE : elle simule le backend Supabase via des routes
// interceptées (products, delivery_zones, create_payment_intent), sans dépendre
// d'un environnement réseau réel.
// ==============================================================================

import { test, expect } from '@playwright/test';

// --- Fixtures simulées (formats REST Supabase) ---
const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';
const ZONE_ID = '22222222-2222-2222-2222-222222222222';

const PRODUCT_ROWS = [
  {
    id: PRODUCT_ID,
    category_id: '33333333-3333-3333-3333-333333333333',
    name: 'Huile d\'argan vierge',
    slug: 'huile-d-argan-vierge',
    description: 'Huile pure de première pression.',
    benefits: 'Nourrissante et régénérante.',
    dosage: 'Quelques gouttes sur la peau.',
    price: 1,
    stock_quantity: 12,
    images: [],
    is_active: true,
    categories: { name: 'Huiles essentielles', slug: 'huiles-essentielles' },
  },
];

const ZONE_ROWS = [
  {
    id: ZONE_ID,
    name: 'Cotonou Centre',
    city: 'Cotonou',
    country: 'BJ',
    zone_type: 'radius',
    center_lat: 6.37,
    center_lng: 2.39,
    radius_km: 10,
    base_fee: 1,
    per_km_fee: 0.5,
    free_delivery_threshold: 25,
    is_active: true,
  },
];

const PAYMENT_RESPONSE = {
  success: true,
  data: {
    order: { id: 'order-1', number: 'CMD-20260101-ABC123', status: 'pending' },
    breakdown: {
      itemsTotal: 1,
      deliveryFee: 1,
      totalAmount: 2,
      currency: 'USD',
      distanceKm: 1.2,
    },
    paymentIntent: { provider: 'mobile_money', providerRef: 'mm_123', clientSecret: null },
  },
};

test.beforeEach(async ({ page, context }) => {
  // Autorise la géolocalisation simulée du navigateur.
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
  await context.setGeolocation({ latitude: 6.3703, longitude: 2.3912 });

  // Interceptions : produits, zones et Edge Function (backend simulé).
  // NOTE : le frontend export statique interroge Supabase en cross-origin
  // (127.0.0.1:54321) -> les réponses simulées doivent porter les en-têtes CORS.
  // supabase-js envoie les headers apikey/Authorization, ce qui déclenche une
  // préflight OPTIONS : on doit y répondre explicitement.
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info',
    'access-control-max-age': '86400',
  };
  const fulfillCors = (route: import('@playwright/test').Route, body: unknown) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: corsHeaders })
      : route.fulfill({ status: 200, headers: corsHeaders, json: body });

  await page.route('**/rest/v1/products**', (route) => fulfillCors(route, PRODUCT_ROWS));
  await page.route('**/rest/v1/delivery_zones**', (route) => fulfillCors(route, ZONE_ROWS));
  await page.route('**/functions/v1/create_payment_intent', (route) =>
    fulfillCors(route, PAYMENT_RESPONSE),
  );
});

test('parcours complet : panier → GPS → paiement → confirmation', async ({ page }) => {
  // 1) Arrivée sur la boutique (storefront). Le site a une basePath /herbo
  //    (export statique GitHub Pages), il faut donc naviguer vers /herbo/.
  await page.goto('/herbo/');
  await expect(page.getByRole('heading', { name: 'Notre catalogue' })).toBeVisible();

  // 2) Ajout au panier (optimistic UI).
  await page.getByRole('button', { name: /ajouter au panier/i }).first().click();
  await expect(page.getByText('Ajouté ✓').first()).toBeVisible();

  // 3) Navigation vers le checkout via le lien panier.
  await page.getByLabel(/voir mon panier/i).click();
  await page.waitForURL('**/herbo/checkout/');
  await expect(page.getByRole('heading', { name: 'Finaliser la commande' })).toBeVisible();

  // 4) Sélection de la zone de livraison (fixture).
  await page.getByLabel('Zone de livraison').selectOption(ZONE_ID);

  // 5) Position GPS : bouton "Utiliser ma position GPS" (géolocalisation simulée).
  await page.getByRole('button', { name: 'Utiliser ma position GPS' }).click();
  await expect(page.getByLabel('Latitude')).not.toHaveValue('');
  await expect(page.getByLabel('Longitude')).not.toHaveValue('');

  // 6) Adresse texte.
  await page.getByPlaceholder(/quartier/i).fill('Quartier Haie Vive, maison 12');

  // 7) Paiement Mobile Money (sélectionné par défaut) + numéro.
  await page.getByPlaceholder('+229 90000000').fill('+229 90000000');

  // 8) Validation de la commande.
  await page.getByRole('button', { name: /commander/i }).click();

  // 9) Écran de confirmation : référence et montant.
  await expect(page.getByRole('heading', { name: 'Commande initialisée' })).toBeVisible();
  await expect(page.getByText('CMD-2026', { exact: false })).toBeVisible();

  // 10) Le détail du montant est visible dans le récapitulatif de confirmation ($2 = articles $1 + livraison $1).
  await expect(page.getByText('$2.00')).toBeVisible();
});