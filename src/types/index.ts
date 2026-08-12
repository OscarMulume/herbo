// ==============================================================================
// types/index.ts — Types domain du projet (interface public du frontend)
// ------------------------------------------------------------------------------
// Ces types reflètent les tables de la base mais en casse camelCase, mappés
// par les dépôts. Ils sont indépendants de Supabase : si la base change, seuls
// les dépôts changent, pas les composants UI ni les services.
// ==============================================================================

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'mobile_money' | 'card' | 'cash_on_delivery';

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  benefits: string | null;
  dosage: string | null;
  price: number;
  stockQuantity: number;
  images: string[];
  isActive: boolean;
  category?: Pick<Category, 'name' | 'slug'>;
}

export type DeliveryZoneType = 'polygon' | 'radius';

export interface DeliveryZone {
  id: string;
  name: string;
  city: string;
  country: string;
  zoneType: DeliveryZoneType;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  baseFee: number;
  perKmFee: number;
  freeDeliveryThreshold: number;
  isActive: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  driverId: string | null;
  /** Message personnalisé du vendeur (instructions de livraison). */
  deliveryMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

/** Article du panier côté frontend. */
export interface CartItem {
  productId: string;
  quantity: number;
}

/** Point GPS fourni via le Pin de localisation. */
export interface GeolocationPoint {
  lat: number;
  lng: number;
}