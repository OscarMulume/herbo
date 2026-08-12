// ==============================================================================
// Edge Function — payment_webhook (Deno / TypeScript)
// ------------------------------------------------------------------------------
// Objectif :
//   Recevoir les webhooks de l'agrégateur de paiement (Mobile Money / Carte),
//   vérifier cryptographiquement leur signature puis, en cas de succès :
//     * transition atomique + idempotente de la commande 'pending' -> 'paid'.
//   En cas d'échec de paiement :
//     * annulation de la commande et restitution atomique du stock.
//
// Garanties de sécurité / résilience :
//   * Vérification HMAC-SHA256 de la signature avec comparaison à temps constant.
//   * Idempotence : la contrainte UNIQUE sur payment_events.webhook_id + les
//     transitions conditionnelles (WHERE status='pending') empêchent les doubles
//     traitements et les doubles retours de stock.
//   * Vérification du montant : le webhook doit correspondre au total réel de la
//     commande (anti-tampering).
//   * verify_jwt = false (config.toml) : l'authenticité vient de la signature,
//     pas d'un JWT ; la protection repose donc sur le secret HMAC partagé.
//
// À noter : la Edge Function n'opère que sur la base via des RPC accessibles
// exclusivement à service_role — jamais par un client.
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logger } from '../_shared/logger.ts';
import { AppError, jsonError, jsonSuccess } from '../_shared/errors.ts';

/** Enveloppe typique d'un événement envoyé par l'agrégateur. */
interface WebhookEvent {
  event_type: 'payment.succeeded' | 'payment.failed';
  data: {
    order_id: string;
    webhook_id: string;
    payment_ref?: string | null;
    /** Montant en plus petite unité (ex: centimes). */
    amount?: number;
    currency?: string;
  };
}

/** Configuration chargée depuis l'environnement. */
interface Env {
  supabaseUrl: string;
  serviceRoleKey: string;
  webhookSecret: string;
}

/**
 * Compare deux chaînes hexadécimales en temps CONSTANT pour se prémunir des
 * attaques par timing (évite que la durée de comparaison aide à deviner le HMAC).
 *
 * @param a - Signature attendue calculée localement.
 * @param b - Signature reçue dans l'en-tête.
 * @returns true si les deux chaînes sont strictement identiques.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    // XOR accumulé : le résultat final n'est 0 que si tous les octets coïncident.
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Vérifie la signature HMAC-SHA256 du corps reçu.
 *
 * @param rawBody         - Corps brut (texte) tel qu'envoyé, avant parsing.
 * @param signatureHeader - Valeur de l'en-tête portant la signature (hex).
 * @param secret          - Secret partagé d' webhook.
 * @returns true si la signature est valide.
 */
async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(rawBody),
    );
    const expected = [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return constantTimeEqual(expected, signatureHeader.trim());
  } catch (error) {
    // Un échec de calcul ne doit jamais être interprété comme une signature valide.
    logger.warn('Erreur de calcul HMAC', { error });
    return false;
  }
}

/**
 * Charge les variables d'environnement nécessaires.
 *
 * @returns Configuration validée.
 * @throws {AppError} MISSING_ENV si le secret ou l'URL manquent.
 */
function loadEnv(): Env {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('PAYMENT_AGGREGATOR_WEBHOOK_SECRET');

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    throw new AppError(500, 'MISSING_ENV', 'Configuration du webhook incomplète.');
  }
  return { supabaseUrl, serviceRoleKey, webhookSecret };
}

/**
 * Parse et valide la structure minimale d'un événement de webhook.
 *
 * @param rawBody - Corps JSON brut.
 * @returns L'événement typé.
 * @throws {AppError} INVALID_PAYLOAD si la structure est inattendue.
 */
function parseWebhook(rawBody: string): WebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Payload de webhook illisible (JSON).');
  }

  const event = parsed as WebhookEvent;
  if (!event || !event.data || !event.data.order_id || !event.data.webhook_id) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Structure du webhook incomplète.');
  }
  if (event.event_type !== 'payment.succeeded' && event.event_type !== 'payment.failed') {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Type d\'événement inconnu.');
  }
  return event;
}

/**
 * Handler principal du webhook de paiement.
 *
 * @param req - Requête HTTP (l'agrégateur).
 * @returns 200 pour les payloads légitimes; 401 pour les requêtes non signées.
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonError(new AppError(405, 'METHOD_NOT_ALLOWED', 'Seule la méthode POST est attendue.'));
  }

  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    // Configuration manquante : on renvoie une erreur propre plutôt que de crasher.
    return jsonError(error);
  }

  // 1) Lecture du corps BRUT (indispensable pour re-vérifier la signature).
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-aggregator-signature');

  // 2) VERIFICATION DE LA SIGNATURE : si elle échoue, on REFUSE immédiatement
  //    (priorité sur le parsing et le rejeu). Aucune ressource métier n'est
  //    consommée pour une requête non authentifiée.
  const valid = await verifySignature(rawBody, signatureHeader, env.webhookSecret);
  if (!valid) {
    logger.warn('Signature de webhook invalide', { ip: req.headers.get('x-forwarded-for') });
    return Response.json(
      { success: false, error: { code: 'INVALID_SIGNATURE', message: 'Signature inconnue.' } },
      { status: 401 },
    );
  }

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // 3) Parsing de l'événement.
    const event = parseWebhook(rawBody);

    // 4) RE-VÉRIFICATION MONTANT (anti-tampering) : le montant déclaré doit
    //    correspondre au total de la commande stocké en base.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total_amount, currency, status')
      .eq('id', event.data.order_id)
      .maybeSingle();

    if (orderError || !order) {
      logger.error('Commande introuvable pour le webhook', { orderId: event.data.order_id });
      return jsonError(new AppError(404, 'ORDER_NOT_FOUND', 'Commande introuvable.'));
    }

    if (event.data.amount !== undefined) {
      const expectedMinor = Math.round(Number(order.total_amount) * 100);
      if (event.data.amount !== expectedMinor) {
        logger.error('Montant du webhook incohérent avec la commande', {
          orderId: order.id,
          received: event.data.amount,
          expected: expectedMinor,
        });
        return jsonError(new AppError(400, 'AMOUNT_MISMATCH', 'Montant incohérent.'));
      }
    }

    // 5) TRAITEMENT selon le type d'événement (atomic + idempotent côté DB).
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    let result: { data: boolean | null; error: { message: string } | null };

    if (event.event_type === 'payment.succeeded') {
      result = await supabase.rpc('confirm_order_payment', {
        p_order_id: order.id,
        p_payment_ref: event.data.payment_ref ?? null,
        p_webhook_id: event.data.webhook_id,
        p_payload: payload,
      });
    } else {
      result = await supabase.rpc('fail_order_payment', {
        p_order_id: order.id,
        p_webhook_id: event.data.webhook_id,
        p_payload: payload,
      });
    }

    if (result.error) {
      logger.error('Traitement du webhook en échec', { orderId: order.id, error: result.error });
      return jsonError(new AppError(500, 'PROCESSING_ERROR', 'Erreur interne de traitement.'));
    }

    // 6) processed=true => traité pour la première fois ; false => doublon (OK, idempotent).
    logger.info('Webhook traité', {
      orderId: order.id,
      event: event.event_type,
      webhookId: event.data.webhook_id,
      processed: result.data,
    });

    return jsonSuccess({ orderId: order.id, processed: result.data });
  } catch (error) {
    return jsonError(error);
  }
});