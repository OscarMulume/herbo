// ==============================================================================
// _shared/delivery.ts — Logique métier isolée : calcul des frais de livraison
// ------------------------------------------------------------------------------
// But : concentrer ici LA règle de tarification (base + km + seuil gratuit)
// et la validation d'appartenance à une zone (rayon ou polygone), afin que le
// frontend et la base ne contiennent aucune copie de cette règle.
// ==============================================================================

import { AppError } from './errors.ts';
import type { DeliveryZone } from './types.ts';

const EARTH_RADIUS_KM = 6371;

/** Convertit des degrés en radians. */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calcule la distance orthodromique (formule de Haversine) entre deux points GPS.
 *
 * @param lat1 - Latitude du premier point.
 * @param lng1 - Longitude du premier point.
 * @param lat2 - Latitude du second point.
 * @param lng2 - Longitude du second point.
 * @returns La distance en kilomètres.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Détermine si un point GPS est contenu dans un polygone (algorithme du rayon,
 * "ray casting"). Accepte les coordonnées GeoJSON [lng, lat].
 * Un point situé exactement sur un bord du polygone est considéré à l'intérieur.
 *
 * @param lat     - Latitude du point testé.
 * @param lng     - Longitude du point testé.
 * @param polygon - Liste de sommets [lng, lat] formant l'anneau externe.
 * @returns true si le point est à l'intérieur du polygone (bord compris).
 */

/** Seuil de tolérance géométrique (degrés) pour détecter un point sur un bord. */
const EDGE_EPSILON = 1e-9;

/**
 * Vérifie si le point se trouve exactement sur un segment [a, b] (coords [lng,bres]).
 * Produit vectoriel nul (colinéarité) + point dans la boîte englobante du segment.
 */
function isOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (Math.abs(cross) > EDGE_EPSILON) return false;
  return (
    px >= Math.min(ax, bx) - EDGE_EPSILON &&
    px <= Math.max(ax, bx) + EDGE_EPSILON &&
    py >= Math.min(ay, by) - EDGE_EPSILON &&
    py <= Math.max(ay, by) + EDGE_EPSILON
  );
}

export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    // Le point est exactement sur le bord du polygone => considéré à l'intérieur.
    if (isOnSegment(lng, lat, xi, yi, xj, yj)) {
      return true;
    }

    // Les sommets sont en [lng, lat] ; on compare les latitudes (yi, yj) et les longitudes (xi, xj).
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Valide l'appartenance du point de livraison à la zone puis retourne la
 * distance depuis le dépôt central (hub), utilisée pour le tarif au kilomètre.
 *
 * @param zone         - Zone de livraison chargée depuis la base.
 * @param deliveryLat  - Latitude du client.
 * @param deliveryLng  - Longitude du client.
 * @param hubLat       - Latitude du dépôt central (variable d'environnement).
 * @param hubLng       - Longitude du dépôt central.
 * @returns La distance kilométrique hub -> client.
 * @throws {AppError} si le point est hors de la zone (OUTSIDE_DELIVERY_ZONE).
 */
export function computeDeliveryDistanceKm(
  zone: DeliveryZone,
  deliveryLat: number,
  deliveryLng: number,
  hubLat: number,
  hubLng: number,
): number {
  const distanceKm = haversineKm(hubLat, hubLng, deliveryLat, deliveryLng);

  if (zone.zone_type === 'radius') {
    // Zone à rayon : le point doit être dans le rayon du centre.
    const fromCenterKm = haversineKm(
      zone.center_lat ?? deliveryLat,
      zone.center_lng ?? deliveryLng,
      deliveryLat,
      deliveryLng,
    );
    if (zone.radius_km !== null && fromCenterKm > zone.radius_km) {
      throw new AppError(400, 'OUTSIDE_DELIVERY_ZONE', `La position est hors de la zone « ${zone.name} ».`);
    }
    return distanceKm;
  }

  // Zone polygonale : le point doit être à l'intérieur du polygone.
  const ring = zone.polygon_geojson?.coordinates?.[0];
  if (!ring || ring.length < 3) {
    throw new AppError(500, 'INVALID_ZONE_GEOMETRY', 'La géométrie de la zone est invalide.');
  }
  if (!isPointInPolygon(deliveryLat, deliveryLng, ring as [number, number][])) {
    throw new AppError(400, 'OUTSIDE_DELIVERY_ZONE', `La position est hors de la zone « ${zone.name} ».`);
  }
  return distanceKm;
}

/**
 * Calcule les frais de livraison selon la grille de la zone.
 *
 * Règle métier :
 *   frais = base_fee + per_km_fee * distance
 *   si le sous-total atteint free_delivery_threshold (> 0) => livraison offerte.
 *
 * @param zone        - Zone de livraison (tarification dynamique).
 * @param distanceKm  - Distance hub -> client calculée au préalable.
 * @param itemsTotal  - Sous-total du panier (hors frais).
 * @returns Les frais de livraison arrondis à 2 décimales.
 */
export function computeDeliveryFee(
  zone: DeliveryZone,
  distanceKm: number,
  itemsTotal: number,
): number {
  let fee = zone.base_fee + zone.per_km_fee * distanceKm;

  // Livraison offerte au-delà du seuil défini par la zone.
  if (zone.free_delivery_threshold > 0 && itemsTotal >= zone.free_delivery_threshold) {
    fee = 0;
  }

  return Math.round(fee * 100) / 100;
}