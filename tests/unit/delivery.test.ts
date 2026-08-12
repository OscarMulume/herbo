// ==============================================================================
// tests/unit/delivery.test.ts — Tests unitaires de la logique de livraison
// ------------------------------------------------------------------------------
// Vérifie :
//   * La formule de Haversine (valeurs connues).
//   * La grille de tarification (base + au km + seuil de gratuité).
//   * Les limites géographiques (rayon et polygone).
// ==============================================================================

import { describe, expect, it } from 'vitest';
import {
  haversineKm,
  isPointInPolygon,
  computeDeliveryDistanceKm,
  computeDeliveryFee,
} from '../../supabase/functions/_shared/delivery';
import type { DeliveryZone } from '../../supabase/functions/_shared/types';

/** Zone pratique : tarif au rayon kilométrique. */
const radiusZone: DeliveryZone = {
  id: 'zone-radius',
  name: 'Rayon Test',
  city: 'Cotonou',
  zone_type: 'radius',
  center_lat: 6.37,
  center_lng: 2.39,
  radius_km: 10,
  polygon_geojson: null,
  base_fee: 1000,
  per_km_fee: 50,
  min_order_amount: 0,
  free_delivery_threshold: 10000,
};

/** Carré de sommets [lng, lat] encadrant l'origine. */
const squarePolygon: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** Zone polygonale autour de l'origine. */
const polygonZone: DeliveryZone = {
  id: 'zone-poly',
  name: 'Polygone Test',
  city: 'Ville Test',
  zone_type: 'polygon',
  center_lat: null,
  center_lng: null,
  radius_km: null,
  polygon_geojson: { type: 'Polygon', coordinates: [squarePolygon] },
  base_fee: 500,
  per_km_fee: 0,
  min_order_amount: 0,
  free_delivery_threshold: 0,
};

describe('haversineKm', () => {
  it("calcule ~111,19 km pour un degré de longitude à l'équateur", () => {
    const distance = haversineKm(0, 0, 0, 1);
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(112);
  });

  it('retourne 0 pour deux points identiques', () => {
    expect(haversineKm(6.37, 2.39, 6.37, 2.39)).toBe(0);
  });

  it('calcule une distance cohérente Cotonou -> Abidjan (~ 700 km)', () => {
    // Cotonou (6.37, 2.39) ; Abidjan (5.36, -4.01).
    const distance = haversineKm(6.37, 2.39, 5.36, -4.01);
    expect(distance).toBeGreaterThan(650);
    expect(distance).toBeLessThan(780);
  });
});

describe('isPointInPolygon', () => {
  it("détecte un point à l'intérieur du carré", () => {
    expect(isPointInPolygon(0.5, 0.5, squarePolygon)).toBe(true);
  });

  it("détecte un point à l'extérieur du carré", () => {
    expect(isPointInPolygon(2, 2, squarePolygon)).toBe(false);
  });

  it('traite un point sur le bord', () => {
    expect(isPointInPolygon(1, 0, squarePolygon)).toBe(true);
  });
});

describe('computeDeliveryDistanceKm — limites géographiques', () => {
  it('accepte un point dans le rayon et retourne la distance', () => {
    // Même coordonnées que le hub : distance ~0, dans le rayon.
    const distance = computeDeliveryDistanceKm(radiusZone, 6.37, 2.39, 6.37, 2.39);
    expect(distance).toBeCloseTo(0, 1);
  });

  it('rejette (throw) un point hors du rayon', () => {
    // Point situé à environ 350 km : hors du rayon de 10 km.
    expect(() => computeDeliveryDistanceKm(radiusZone, 3.3, 2.0, 6.37, 2.39)).toThrow(/hors de la zone/);
  });

  it('accepte un point contenu dans le polygone', () => {
    const distance = computeDeliveryDistanceKm(polygonZone, 0.2, 0.2, 6.37, 2.39);
    expect(distance).toBeGreaterThanOrEqual(0);
  });

  it('rejette (throw) un point hors du polygone', () => {
    expect(() => computeDeliveryDistanceKm(polygonZone, 3.0, 3.0, 6.37, 2.39)).toThrow(/hors de la zone/);
  });
});

describe('computeDeliveryFee', () => {
  it('applique le tarif de base + le taux kilométrique', () => {
    // 1000 + 50 * 5 = 1250 (sous-total < seuil de gratuité).
    const fee = computeDeliveryFee(radiusZone, 5, 3000);
    expect(fee).toBe(1250);
  });

  it('offre la livraison si le seuil de gratuité est atteint', () => {
    // Sous-total 12000 >= 10000 => gratuit.
    const fee = computeDeliveryFee(radiusZone, 5, 12000);
    expect(fee).toBe(0);
  });

  it("n'offre jamais la gratuité si le seuil est à zéro", () => {
    const neverFree = { ...radiusZone, free_delivery_threshold: 0 };
    const fee = computeDeliveryFee(neverFree, 0, 500000);
    expect(fee).toBe(1000); // uniquement le tarif de base.
  });

  it('arrondit les frais à deux décimales', () => {
    const fee = computeDeliveryFee({ ...radiusZone, per_km_fee: 10.35 }, 3.3, 100);
    expect(fee).toBe(Math.round((1000 + 10.35 * 3.3) * 100) / 100);
  });
});