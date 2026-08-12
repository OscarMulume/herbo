// ==============================================================================
// services/data/order.repository.ts — Dépôt de données : commandes (lectures)
// ------------------------------------------------------------------------------
// Note de sécurité : les CRÉATIONS de commandes ne passent PAS par ce dépôt.
// Elles transitent par l'Edge Function create_payment_intent (réservation
// atomique du stock + calcul des frais + intention de paiement).
// Ce dépôt ne sert qu'aux LECTURES (historique client, suivi de commande).
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/utils/errors';
import { clientLogger } from '@/lib/utils/logger';
import type { Order } from '@/types';

/** Mapping ligne DB (snake_case) -> domaine (camelCase). */
function mapRowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    orderNumber: row.order_number as string,
    userId: row.user_id as string,
    status: row.status as Order['status'],
    itemsTotal: Number(row.items_total),
    deliveryFee: Number(row.delivery_fee),
    totalAmount: Number(row.total_amount),
    currency: row.currency as string,
    paymentMethod: row.payment_method as Order['paymentMethod'],
    deliveryAddress: row.delivery_address as string,
    deliveryLat: row.delivery_lat as number,
    deliveryLng: row.delivery_lng as number,
    driverId: (row.driver_id as string | null) ?? null,
    deliveryMessage: (row.delivery_message as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Récupère l'historique des commandes de l'utilisateur connecté.
 * La politique RLS "Un client ne voit que ses propres commandes" s'applique.
 *
 * @param userId - Identifiant de l'utilisateur connecté.
 * @param client - Client Supabase injecté (défaut : client serveur).
 * @returns La liste des commandes de l'utilisateur, plus récentes d'abord.
 * @throws {AppError} ORDERS_FETCH_FAILED en cas d'échec d'accès aux données.
 */
export async function getOrdersByUser(
  userId: string,
  client: SupabaseClient,
): Promise<Order[]> {
  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapRowToOrder);
  } catch (error) {
    clientLogger.error('orderRepository.getOrdersByUser', { error });
    throw new AppError('ORDERS_FETCH_FAILED', 'Impossible de charger vos commandes.', { cause: error });
  }
}