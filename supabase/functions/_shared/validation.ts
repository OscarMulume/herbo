// ==============================================================================
// _shared/validation.ts — Schémas de validation des entrées (Zod, Deno)
// ------------------------------------------------------------------------------
// Objectif sécurité :
//   * Rejet strict, à la source, de TOUTE entrée inattendue (allowlist).
//   * Contra courtesy GPS (lat [-90,90], lng [-180,180]), quantités entières
//     positives limitées, adresses bornées.
//   * Sanitisation des numéros de téléphone (normalisation des séparateurs).
//   * UUID contraint par .uuid() (formats stricts, empêche toute injection).
// ==============================================================================

import { z } from 'https://esm.sh/zod@3.23.8';

/** Règle d'acceptation d'un numéro de téléphone (8 à 15 chiffres, + en option). */
const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

/**
 * Prépare un numéro de téléphone : supprime espaces, tirets, parenthèses
 * pour ne conserver que les chiffres et l'éventuel signe '+'. Ne rejette pas,
 * il transforme (c'est une sanitisation, pas une validation).
 *
 * @param value - Numéro brut saisi par l'utilisateur.
 * @returns Le numéro normalisé (prêt à valider / stocker).
 */
export function sanitizePhone(value: string): string {
  return value.replace(/[^0-9+]/g, '');
}

/** Payload attendu par la Edge Function create_payment_intent. */
export const paymentIntentSchema = z.object({
  items: z.array(
    z.object({
      product_id: z.string().uuid('Identifiant produit invalide.'),
      quantity: z
        .number()
        .int('La quantité doit être un entier.')
        .positive('La quantité doit être positive.')
        .max(999, 'Quantité trop élevée.'),
    }),
  ).min(1, 'Le panier est vide'),

  delivery_zone_id: z.string().uuid('Zone de livraison invalide.'),
  delivery_lat: z.number().min(-90).max(90),
  delivery_lng: z.number().min(-180).max(180),

  delivery_address: z
    .string()
    .trim()
    .min(3, 'Adresse de livraison trop courte.')
    .max(500, 'Adresse de livraison trop longue.'),

  delivery_notes: z.string().trim().max(500).nullable().optional(),

  payment_method: z.enum(['mobile_money', 'card', 'cash_on_delivery']),
  customer_phone: z
    .string()
    .regex(PHONE_PATTERN, 'Numéro de téléphone invalide.')
    .optional()
    .nullable(),
}).refine(
  // Si le client choisit Mobile Money, le numéro est obligatoire.
  (data) => data.payment_method !== 'mobile_money' || Boolean(data.customer_phone),
  { message: 'Le numéro Mobile Money est requis.', path: ['customer_phone'] },
);

/** Type inféré du payload validé. */
export type PaymentIntentPayload = z.infer<typeof paymentIntentSchema>;