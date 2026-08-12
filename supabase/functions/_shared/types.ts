// ==============================================================================
// _shared/types.ts — Types partagés de la Edge Function create_payment_intent
// ==============================================================================

/** Article du panier transmis par le frontend. */
export interface CartItemInput {
  product_id: string;
  quantity: number;
}

/** Corps de requête attendu par la Edge Function. */
export interface PaymentIntentRequest {
  /** Articles du panier (produit + quantité). */
  items: CartItemInput[];
  /** Identifiant de la zone de livraison choisie. */
  delivery_zone_id: string;
  /** Latitude GPS du point de livraison (Pin). */
  delivery_lat: number;
  /** Longitude GPS du point de livraison (Pin). */
  delivery_lng: number;
  /** Adresse texte libre (repère, quartier…). */
  delivery_address: string;
  /** Notes de livraison optionnelles. */
  delivery_notes?: string | null;
  /** Moyen de paiement sélectionné par le client. */
  payment_method: 'mobile_money' | 'card' | 'cash_on_delivery';
  /** Numéro de téléphone pour les paiements Mobile Money (obligatoire si mobile_money). */
  customer_phone?: string;
}

/** Zone de livraison telle que retournée par la table delivery_zones. */
export interface DeliveryZone {
  id: string;
  name: string;
  city: string;
  zone_type: 'polygon' | 'radius';
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number | null;
  polygon_geojson: { type: string; coordinates: [number, number][][] } | null;
  base_fee: number;
  per_km_fee: number;
  min_order_amount: number;
  free_delivery_threshold: number;
}

/** Réponse du fournisseur de paiement (agrégateur local). */
export interface ProviderIntent {
  /** Référence unique chez l'agrégateur. */
  providerRef: string;
  /** Secret de validation client (ex: token de paiement). */
  clientSecret?: string | null;
}