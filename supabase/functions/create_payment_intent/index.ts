// ==============================================================================
// Edge Function — create_payment_intent (Deno / TypeScript)
// ------------------------------------------------------------------------------
// Objectif :
//   Prend un panier + une zone de livraison + une position GPS, vérifie les
//   stocks réels (réservation atomique en base), calcule le sous-total et les
//   frais de livraison, crée la commande, puis initie le paiement auprès de
//   l'agrégateur local (Mobile Money / Cartes). Retourne un payment_intent.
//
// Garanties de sécurité :
//   * Confirmée par la passerelle (verify_jwt) ET ré-authentifiée dans le code.
//   * Validation stricte des entrées via Zod (allowlist, coordonnées, UUID,
//     sanitisation téléphone) — voir _shared/validation.ts.
//   * Rate limiting applicatif (limite d'intentions par utilisateur) via la
//     table rate_limits et le RPC acquire_rate_limit.
//   * Le rôle service_role est utilisé côté serveur (jamais exposé au client).
//   * La création de commande est atomique côté PostgreSQL (fonction métier
//     accessible uniquement à service_role) : le client ne peut pas tricher
//     sur le prix ni contourner la réservation du stock.
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { handleCors } from '../_shared/cors.ts';
import { AppError, jsonError, jsonSuccess } from '../_shared/errors.ts';
import { logger } from '../_shared/logger.ts';
import { computeDeliveryDistanceKm, computeDeliveryFee } from '../_shared/delivery.ts';
import { paymentIntentSchema, sanitizePhone, type PaymentIntentPayload } from '../_shared/validation.ts';
import type { DeliveryZone, ProviderIntent } from '../_shared/types.ts';

/** Limites anti-abuse : au maximum N créations d'intentions par fenêtre. */
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_WINDOW_SECONDS = 600; // 10 minutes

/** Configuration chargée depuis l'environnement (aucune valeur en dur). */
interface Env {
  supabaseUrl: string;
  serviceRoleKey: string;
  hubLat: number;
  hubLng: number;
  aggregatorBaseUrl: string;
  aggregatorApiKey: string;
}

/**
 * Charge et valide les variables d'environnement nécessaires au traitement.
 *
 * @returns Une configuration validée.
 * @throws {AppError} MISSING_ENV (500) si une variable requise est absente.
 */
function loadEnv(): Env {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const aggregatorBaseUrl = Deno.env.get('PAYMENT_AGGREGATOR_BASE_URL');
  const aggregatorApiKey = Deno.env.get('PAYMENT_AGGREGATOR_API_KEY');

  if (!supabaseUrl || !aggregatorBaseUrl || !aggregatorApiKey) {
    throw new AppError(500, 'MISSING_ENV', 'Configuration serveur incomplète.');
  }

  return {
    supabaseUrl,
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    hubLat: Number(Deno.env.get('HUB_LAT') ?? 0),
    hubLng: Number(Deno.env.get('HUB_LNG') ?? 0),
    aggregatorBaseUrl,
    aggregatorApiKey,
  };
}

/**
 * Applique le rate limiting avant toute opération coûteuse.
 * Stratégie fail-open : si le RPC de comptage échoue (dégradation d'infra),
 * on autorise la requête plutôt que de bloquer tous les clients légitimes.
 *
 * @param supabase - Client Supabase (service_role).
 * @param userId   - Identifiant de l'utilisateur (clé de comptage).
 * @throws {AppError} RATE_LIMITED (429) si la limite est dépassée.
 */
async function enforceRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const resource = `payment-intent:${userId}`;
  const { data: allowed, error } = await supabase.rpc('acquire_rate_limit', {
    p_resource: resource,
    p_limit: RATE_LIMIT_COUNT,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });

  if (error) {
    // Échec d'infrastructure : on ne bloque pas (fail-open), mais on trace.
    logger.error('Rate limiter indisponible', { error });
    return;
  }

  if (allowed !== true) {
    logger.warn('Limite de débit atteinte', { resource });
    throw new AppError(429, 'RATE_LIMITED', 'Trop de demandes récentes. Réessayez dans quelques minutes.');
  }
}

/**
 * Mappe les codes d'erreur SQL (levés par la fonction PostgreSQL) sur un code
 * métier stable à renvoyer au client.
 *
 * @param message - Message d'erreur PG (ex: "INSUFFICIENT_STOCK:uuid").
 * @returns Un code métier lisible et stable pour le frontend.
 */
function mapDbErrorToCode(message: string): string {
  if (message.startsWith('INSUFFICIENT_STOCK')) return 'INSUFFICIENT_STOCK';
  if (message.startsWith('PRODUCT_NOT_FOUND')) return 'PRODUCT_NOT_FOUND';
  if (message.startsWith('EMPTY_CART')) return 'EMPTY_CART';
  if (message.startsWith('DELIVERY_ZONE_INVALID')) return 'DELIVERY_ZONE_INVALID';
  return 'ORDER_CREATION_FAILED';
}

/**
 * Crée l'intention de paiement auprès de l'agrégateur local (Mobile Money /
 * carte). Enveloppe isolant les erreurs réseau ou fournisseur.
 *
 * @param env         - Configuration.
 * @param payload     - Entrée validée (nécessaire pour customer_phone).
 * @param amountMinor - Montant en plus petite unité (ex: centimes).
 * @param currency    - Code devise (ex: XOF).
 * @returns La référence et l'éventuel client secret de l'agrégateur.
 * @throws {AppError} si l'agrégateur est injoignable ou renvoie une erreur.
 */
async function createProviderIntent(
  env: Env,
  payload: PaymentIntentPayload,
  amountMinor: number,
  currency: string,
): Promise<ProviderIntent> {
  try {
    const response = await fetch(`${env.aggregatorBaseUrl}/v1/payment-intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.aggregatorApiKey,
      },
      body: JSON.stringify({
        amount: amountMinor,
        currency,
        // Téléphone sanitizé (chiffres uniquement, conformité agrégateur).
        customer_phone: payload.customer_phone ? sanitizePhone(payload.customer_phone) : undefined,
        callback_url: Deno.env.get('PAYMENT_CALLBACK_URL'),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.error('Le fournisseur de paiement a refusé la demande', {
        status: response.status,
        detail,
      });
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Impossible d\'initialiser le paiement.');
    }

    const data = await response.json();
    return {
      providerRef: data?.id ?? data?.reference ?? '',
      clientSecret: data?.client_secret ?? null,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Erreur réseau vers le fournisseur de paiement', { error });
    throw new AppError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Le fournisseur de paiement est injoignable.');
  }
}

/**
 * Handler principal de la Edge Function.
 *
 * @param req - Requête HTTP (Supabase)
 * @returns Une réponse HTTP JSON normalisée (succès ou erreur standardisée).
 */
Deno.serve(async (req) => {
  // Pré-vérification CORS.
  const preflight = handleCors(req);
  if (preflight) return preflight;

  // Seule la création d'une intention (POST) est acceptée.
  if (req.method !== 'POST') {
    return jsonError(new AppError(405, 'METHOD_NOT_ALLOWED', 'Seule la méthode POST est autorisée.'));
  }

  try {
    const env = loadEnv();
    const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) AUTHENTIFICATION — l'utilisateur doit posséder une session valide.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentification requise.');
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      logger.warn('Jeton invalide ou expiré');
      throw new AppError(401, 'UNAUTHORIZED', 'Session invalide ou expirée.');
    }

    // 2) RATE LIMITING (avant toute opération coûteuse ou de création).
    await enforceRateLimit(supabase, user.id);

    // 3) VALIDATION STRICTE des entrées (Zod : allowlist, UUID, coordonnées).
    const body = await req.json().catch(() => null);
    const parsed = paymentIntentSchema.safeParse(body);
    if (!parsed.success) {
      // On ne renvoie que le PREMIER problème rencontré (message lisible).
      const firstIssue = parsed.error.issues[0];
      logger.warn('Entrée invalide', { code: firstIssue?.code, path: firstIssue?.path?.join('.') });
      throw new AppError(400, 'VALIDATION_ERROR', firstIssue?.message ?? 'Données invalides.');
    }
    const payload = parsed.data;

    // 4) CHARGEMENT DE LA ZONE ACTIVE.
    const { data: zone, error: zoneError } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('id', payload.delivery_zone_id)
      .eq('is_active', true)
      .maybeSingle();
    if (zoneError) {
      logger.error('Erreur de lecture de la zone', { error: zoneError });
      throw new AppError(500, 'DB_ERROR', 'Impossible de lire la zone de livraison.');
    }
    if (!zone) {
      throw new AppError(400, 'DELIVERY_ZONE_INVALID', 'Zone de livraison introuvable ou inactive.');
    }

    // 5) SOUS-TOTAL ESTIMÉ (lecture rapide pour la grille des frais).
    //    La source de vérité reste la base : le RPC recalculera au prix courant.
    const productIds = payload.items.map((item) => item.product_id);
    const { data: products } = await supabase
      .from('products')
      .select('id, price')
      .in('id', productIds);

    const itemsTotal = payload.items.reduce((sum, item) => {
      const product = products?.find((p) => p.id === item.product_id);
      if (!product) {
        throw new AppError(400, 'PRODUCT_NOT_FOUND', `Produit inconnu ou indisponible : ${item.product_id}`);
      }
      return sum + Number(product.price) * item.quantity;
    }, 0);

    // 6) FRAIS DE LIVRAISON — logique métier isolée dans _shared/delivery.ts.
    const distanceKm = computeDeliveryDistanceKm(
      zone as DeliveryZone,
      payload.delivery_lat,
      payload.delivery_lng,
      env.hubLat,
      env.hubLng,
    );
    const deliveryFee = computeDeliveryFee(zone as DeliveryZone, distanceKm, itemsTotal);

    logger.info('Estimation commande', {
      userId: user.id,
      itemsTotal,
      deliveryFee,
      distanceKm,
    });

    // 7) RÉSERVATION ATOMIQUE DU STOCK + CRÉATION DE LA COMMANDE (RPC sécurisé).
    const { data: order, error: orderError } = await supabase.rpc(
      'create_order_from_cart',
      {
        p_user_id: user.id,
        p_items: payload.items,
        p_delivery_zone_id: payload.delivery_zone_id,
        p_delivery_fee: deliveryFee,
        p_delivery_lat: payload.delivery_lat,
        p_delivery_lng: payload.delivery_lng,
        p_delivery_address: payload.delivery_address,
        p_delivery_notes: payload.delivery_notes ?? null,
        p_payment_method: payload.payment_method,
      },
    );

    if (orderError) {
      logger.warn('Création de commande rejetée', { message: orderError.message });
      throw new AppError(
        409,
        mapDbErrorToCode(orderError.message),
        'Impossible de valider votre panier (stocks insuffisants ou indisponibilité).',
      );
    }

    // 8) CRÉATION DE L'INTENTION DE PAIEMENT chez l'agrégateur.
    const amountMinor = Math.round(order.total_amount * 100);
    const provider = await createProviderIntent(env, payload, amountMinor, order.currency);

    logger.info('Intention de paiement créée', {
      orderId: order.order_id,
      providerRef: provider.providerRef,
      amountMinor,
      currency: order.currency,
    });

    // 9) RÉPONSE NORMALISÉE pour le frontend.
    return jsonSuccess({
      order: {
        id: order.order_id,
        number: order.order_number,
        status: 'pending',
      },
      breakdown: {
        itemsTotal: order.items_total,
        deliveryFee: order.delivery_fee,
        totalAmount: order.total_amount,
        currency: order.currency,
        distanceKm,
      },
      paymentIntent: {
        provider: payload.payment_method,
        providerRef: provider.providerRef,
        clientSecret: provider.clientSecret ?? null,
      },
    });
  } catch (error) {
    // Centralise toute erreur (AppError) ou erreur imprévue (interne masquée).
    return jsonError(error);
  }
});