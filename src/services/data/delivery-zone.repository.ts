// ==============================================================================
// services/data/delivery-zone.repository.ts — Dépôt de données : zones
// ------------------------------------------------------------------------------
// Même principe que product.repository : seule cette couche interroge Supabase.
// Les zones servent au formulaire de checkout pour sélectionner la livraison.
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/utils/errors';
import { clientLogger } from '@/lib/utils/logger';
import type { DeliveryZone } from '@/types';

/** Mapping ligne DB (snake_case) -> domaine (camelCase). */
function mapRowToZone(row: Record<string, unknown>): DeliveryZone {
  return {
    id: row.id as string,
    name: row.name as string,
    city: row.city as string,
    country: row.country as string,
    zoneType: row.zone_type as DeliveryZone['zoneType'],
    centerLat: row.center_lat as number | null,
    centerLng: row.center_lng as number | null,
    radiusKm: row.radius_km as number | null,
    baseFee: Number(row.base_fee),
    perKmFee: Number(row.per_km_fee),
    freeDeliveryThreshold: Number(row.free_delivery_threshold),
    isActive: Boolean(row.is_active),
  };
}

/**
 * Récupère les zones de livraison actives (pour le sélecteur du checkout).
 *
 * @param client - Client Supabase injecté (défaut : client serveur).
 * @returns La liste des zones actives.
 * @throws {AppError} ZONES_FETCH_FAILED en cas d'échec d'accès aux données.
 */
export async function getActiveDeliveryZones(
  client: SupabaseClient,
): Promise<DeliveryZone[]> {
  try {
    const { data, error } = await client
      .from('delivery_zones')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapRowToZone);
  } catch (error) {
    clientLogger.error('deliveryZoneRepository.getActiveDeliveryZones', { error });
    throw new AppError('ZONES_FETCH_FAILED', 'Impossible de charger les zones de livraison.', { cause: error });
  }
}