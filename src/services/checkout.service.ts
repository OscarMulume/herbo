// ==============================================================================
// services/checkout.service.ts — Service métier du parcours de paiement
// ------------------------------------------------------------------------------
// Orchestration côté client :
//   1. Le frontend envoie panier + zone + position GPS à l'Edge Function.
//   2. L'Edge Function valide les stocks (réservation atomique), calcule les
//      frais, crée la commande et initie le paiement chez l'agrégateur.
//   3. Le service retourne une intention de paiement prête à être traitée.
//
// Sécurité : aucune clé secrète ici ; la réservation de stock se fait côté
// serveur via un RPC accessible uniquement à service_role.
// ==============================================================================

import { createBrowserClient } from '@/lib/supabase/client';
import { AppError } from '@/lib/utils/errors';
import { clientLogger } from '@/lib/utils/logger';
import { initiatePaymentSchema } from '@/lib/validation/schemas';
import type { CartItem, GeolocationPoint, PaymentMethod } from '@/types';

/** Entrée du service : ce que le composant Checkout fournit. */
export interface InitiatePaymentInput {
  /** Articles du panier (produit + quantité). */
  items: CartItem[];
  /** Identifiant de la zone de livraison sélectionnée. */
  deliveryZoneId: string;
  /** Position GPS du client (Pin sur la carte). */
  location: GeolocationPoint;
  /** Adresse texte libre (repère, quartier…). */
  deliveryAddress: string;
  /** Notes optionnelles de livraison. */
  deliveryNotes?: string | null;
  /** Moyen de paiement choisi. */
  paymentMethod: PaymentMethod;
  /** Téléphone requis pour Mobile Money. */
  customerPhone?: string;
}

/** Réponse structurée de la Edge Function (succès). */
export interface PaymentIntentResult {
  order: {
    id: string;
    number: string;
    status: string;
  };
  breakdown: {
    itemsTotal: number;
    deliveryFee: number;
    totalAmount: number;
    currency: string;
    distanceKm: number;
  };
  paymentIntent: {
    provider: PaymentMethod;
    providerRef: string;
    clientSecret: string | null;
  };
}

/**
 * Déclenche la création de l'intention de paiement auprès de la Edge Function.
 *
 * @param input - Panier, zone, position GPS et moyen de paiement du client.
 * @returns Une intention de paiement prête à être utilisée par l'UI.
 * @throws {AppError} en cas d'échec (code métier transmis par l'Edge Function
 *         ou erreur réseau), le message étant sûr à afficher au client.
 */
export async function initiatePayment(input: InitiatePaymentInput): Promise<PaymentIntentResult> {
  const supabase = createBrowserClient();

  try {
    // VALIDATION STRICTE AVANT APPEL RÉSEAU (Zod) : rejet précoce d'une entrée
    // invalide (quantité nulle, coordonnées hors bornes, téléphone malformé).
    const payload = {
      items: input.items,
      deliveryZoneId: input.deliveryZoneId,
      location: input.location,
      deliveryAddress: input.deliveryAddress,
      deliveryNotes: input.deliveryNotes ?? null,
      paymentMethod: input.paymentMethod,
      customerPhone: input.customerPhone,
    };
    const parsed = initiatePaymentSchema.safeParse(payload);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Données de commande invalides.';
      throw new AppError('VALIDATION_ERROR', message);
    }

    const { data, error } = await supabase.functions.invoke(
      'create_payment_intent',
      {
        body: {
          items: parsed.data.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
          delivery_zone_id: parsed.data.deliveryZoneId,
          delivery_lat: parsed.data.location.lat,
          delivery_lng: parsed.data.location.lng,
          delivery_address: parsed.data.deliveryAddress,
          delivery_notes: parsed.data.deliveryNotes ?? null,
          payment_method: parsed.data.paymentMethod,
          // Téléphone normalisé (chiffres uniquement) avant transmission.
          customer_phone: parsed.data.customerPhone,
        },
      },
    );

    // Erreur technique d'invocation de la fonction.
    if (error) {
      clientLogger.error('checkoutService.initiatePayment — erreur d\'invocation', {
        code: error.code,
        message: error.message,
      });
      throw new AppError(error.code ?? 'PAYMENT_INIT_FAILED', error.message);
    }

    // La fonction renvoie toujours { success, data } ou { success, error }.
    if (!data?.success) {
      const code = (data?.error?.code as string) ?? 'PAYMENT_INIT_FAILED';
      const message = (data?.error?.message as string) ?? 'Impossible d\'initialiser le paiement.';
      throw new AppError(code, message);
    }

    return data.data as PaymentIntentResult;
  } catch (error) {
    // Laisse remonter les AppError déjà normalisés ; journalise les imprévus.
    if (error instanceof AppError) throw error;
    clientLogger.error('checkoutService.initiatePayment — erreur inattendue', { error });
    throw new AppError('PAYMENT_INIT_FAILED', 'Impossible d\'initialiser le paiement. Veuillez réessayer.', {
      cause: error,
    });
  }
}