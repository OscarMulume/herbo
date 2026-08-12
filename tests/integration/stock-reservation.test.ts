// ==============================================================================
// tests/integration/stock-reservation.test.ts — Test d'intégration anti-survente
// ------------------------------------------------------------------------------
// Objectif : vérifier que la fonction SQL create_order_from_cart résout la
// course (race condition) entre deux commandes simultanées sur une quantité de
// stock de 1 : exactement UNE réussit, l'autre échoue avec INSUFFICIENT_STOCK,
// et le stock final est bien à zéro.
//
// Prérequis : tourner contre une base Supabase (locale `supabase start` ou de
// dev) dont les migrations 0001-0003 sont appliquées.
// Variables requises : TEST_SUPABASE_URL et TEST_SERVICE_ROLE_KEY.
// Le test est automatiquement ignoré si elles sont absentes.
// ==============================================================================

import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const TEST_URL = process.env.TEST_SUPABASE_URL ?? '';
const TEST_KEY = process.env.TEST_SERVICE_ROLE_KEY ?? '';
const enabled = Boolean(TEST_URL && TEST_KEY);

describe.skipIf(!enabled)('Réservation de stock (anti-survente)', () => {
  it('n\'autorise qu\'une seule commande sur un stock de 1', async () => {
    // Client administrateur (service_role) : contourne la RLS pour préparer les données.
    const admin = createClient(TEST_URL, TEST_KEY, { auth: { persistSession: false } });

    // --- 1. Préparation des données (catégorie, zone, produit, utilisateur) ---
    const suffix = `${Date.now()}`;
    const { data: category, error: catErr } = await admin
      .from('categories')
      .insert({ name: 'Test', slug: `test-${suffix}` })
      .select('id')
      .single();
    if (catErr || !category) throw new Error(`Préparation catégorie : ${catErr?.message}`);

    const { data: zone, error: zoneErr } = await admin
      .from('delivery_zones')
      .insert({
        name: `Zone-Test-${suffix}`,
        city: 'Test',
        zone_type: 'radius',
        center_lat: 6.37,
        center_lng: 2.39,
        radius_km: 50,
        base_fee: 500,
      })
      .select('id')
      .single();
    if (zoneErr || !zone) throw new Error(`Préparation zone : ${zoneErr?.message}`);

    const { data: product, error: prodErr } = await admin
      .from('products')
      .insert({
        category_id: category.id,
        name: `Produit-Ultime-${suffix}`,
        slug: `produit-${suffix}`,
        price: 2500,
        stock_quantity: 1, // Une seule unité disponible.
        is_active: true,
      })
      .select('id, stock_quantity')
      .single();
    if (prodErr || !product) throw new Error(`Préparation produit : ${prodErr?.message}`);

    const { data: user, error: userErr } = await admin.auth.admin.createUser({
      email: `test-${suffix}@localhost.test`,
      password: 'Password123!',
    });
    if (userErr || !user?.user) throw new Error(`Préparation utilisateur : ${userErr?.message}`);
    const userId = user.user.id;

    const payload = {
      p_user_id: userId,
      p_items: [{ product_id: product.id, quantity: 1 }],
      p_delivery_zone_id: zone.id,
      p_delivery_fee: 500,
      p_delivery_lat: 6.3703,
      p_delivery_lng: 2.3912,
      p_delivery_address: 'Rue test',
      p_delivery_notes: null,
      p_payment_method: 'cash_on_delivery',
    };

    // --- 2. Exécution CONCURRENTE de deux créations de commande ---
    const [callA, callB] = await Promise.all([
      admin.rpc('create_order_from_cart', payload),
      admin.rpc('create_order_from_cart', payload),
    ]);

    // --- 3. Assertions ---
    const responses = [callA, callB];
    const successes = responses.filter((r) => !r.error);
    const failures = responses.filter((r) => r.error);

    // Exactement une commande réussie.
    expect(successes).toHaveLength(1);
    // L'autre échoue sur le stock.
    expect(failures).toHaveLength(1);
    expect(failures[0].error?.message).toContain('INSUFFICIENT_STOCK');

    // Le stock réservé est bien à zéro après la course.
    const { data: after } = await admin
      .from('products')
      .select('stock_quantity')
      .eq('id', product.id)
      .single();
    expect(Number(after?.stock_quantity)).toBe(0);

    // --- 4. Nettoyage (ordre respectant les clés étrangères) ---
    await admin.from('orders').delete().eq('user_id', userId);
    await admin.from('products').delete().eq('id', product.id);
    await admin.from('delivery_zones').delete().eq('id', zone.id);
    await admin.from('categories').delete().eq('id', category.id);
    await admin.auth.admin.deleteUser(userId);
  });
});