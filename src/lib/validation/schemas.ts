// ==============================================================================
// lib/validation/schemas.ts — Schémas de validation frontend (Zod)
// ------------------------------------------------------------------------------
// Objectif sécurité : valider et SANITISER les entrées avant tout appel réseau,
// en cohérence avec les schémas applicatifs de la Edge Function (fonctions/
// _shared/validation.ts). Défense en profondeur côté client.
// ==============================================================================

import { z } from 'zod';

// --- Coordonnées GPS (bornes géographiques strictes) ---
export const gpsLatitudeSchema = z.number().min(-90).max(90, 'Latitude invalide.');
export const gpsLongitudeSchema = z.number().min(-180).max(180, 'Longitude invalide.');

// --- Numéro de téléphone : accepte les séparateurs usuels, puis normalisé. ---
const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

/**
 * Sanitise un numéro de téléphone : retrait de tout caractère non numérique
 * (espaces, tirets, parenthèses) pour conserver un format opérable.
 *
 * @param value - Numéro brut saisi par l'utilisateur.
 * @returns Le numéro normalisé (chiffres, éventuel '+' initial).
 */
export function sanitizePhone(value: string): string {
  return value.replace(/[^0-9+]/g, '');
}

/** Schéma d'un numéro de téléphone valide (après sanitisation). */
export const phoneSchema = z
  .string()
  .transform(sanitizePhone)
  .refine((value) => PHONE_PATTERN.test(value) || value === '', 'Numéro de téléphone invalide.')
  .refine((value) => value.length > 0, 'Numéro de téléphone requis.');

// --- Quantités / montants ---
export const quantitySchema = z.number().int('Quantité entière requise.').positive('Quantité positive.').max(999);

export const moneySchema = z.number().nonnegative('Montant négatif.').multipleOf(0.01, 'Montant invalide.');

// --- Un produit du panier ---
export const cartItemSchema = z.object({
  productId: z.string().uuid('Identifiant produit invalide.'),
  quantity: quantitySchema,
});

// --- Position GPS (champ "Pin" de localisation) ---
export const locationSchema = z.object({
  lat: gpsLatitudeSchema,
  lng: gpsLongitudeSchema,
});

// --- Payload complet envoyé au service de checkout -> Edge Function ---
export const initiatePaymentSchema = z
  .object({
    items: z.array(cartItemSchema).min(1, 'Votre panier est vide.'),
    deliveryZoneId: z.string().uuid('Choix de zone de livraison invalide.'),
    location: locationSchema,
    deliveryAddress: z.string().trim().min(3, 'Adresse de livraison trop courte.').max(500),
    deliveryNotes: z.string().trim().max(500).nullable().optional(),
    paymentMethod: z.enum(['mobile_money', 'card', 'cash_on_delivery']),
    customerPhone: phoneSchema.optional().nullable(),
  })
  .refine(
    (data) => data.paymentMethod !== 'mobile_money' || Boolean(data.customerPhone),
    { message: 'Le numéro Mobile Money est requis.', path: ['customerPhone'] },
  );

// --- Version simplifiée utilisé directement par le formulaire de checkout ---
export const checkoutFormSchema = z
  .object({
    deliveryZoneId: z.string().uuid('Choisissez une zone de livraison.'),
    deliveryAddress: z.string().trim().min(3, 'Indiquez une adresse de livraison.').max(500),
    location: locationSchema.nullable(),
    paymentMethod: z.enum(['mobile_money', 'card', 'cash_on_delivery']),
    phone: phoneSchema.optional(),
  })
  .refine((data) => data.location !== null, {
    message: 'Fournissez votre position GPS sur la carte.',
    path: ['location'],
  })
  .refine(
    (data) => data.paymentMethod !== 'mobile_money' || Boolean(data.phone),
    { message: 'Le numéro Mobile Money est requis.', path: ['phone'] },
  );

export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;