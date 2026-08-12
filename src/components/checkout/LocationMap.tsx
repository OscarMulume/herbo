'use client';

// ==============================================================================
// components/checkout/LocationMap.tsx — Carte interactive (Leaflet) + Pin GPS
// ------------------------------------------------------------------------------
// Rendu EXCLUSIVEMENT côté client : ce composant est chargé dynamiquement avec
// { ssr: false } car Leaflet manipule `window` (incompatible avec le SSR).
//
// Comportement :
//   * Un clic sur la carte place le pin.
//   * Le pin est déplaçable (drag & drop) et remonte sa position au parent.
// ==============================================================================

import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeolocationPoint } from '@/types';

// Icône personnalisée (SVG inline) pour éviter la dépendance aux assets Leaflet,
// souvent introuvables avec les bundlers. Autonome et sans requête réseau.
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1C7 1 1 7 1 15c0 10 14 26 14 26s14-16 14-26C29 7 23 1 15 1z" fill="#e11d48" stroke="#9f1239" stroke-width="2"/>
      <circle cx="15" cy="15" r="5" fill="#fff"/>
    </svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -38],
});

/** Type local des coordonnées finières exposé par la carte. */
export interface MapCoordinates {
  lat: number;
  lng: number;
}

/**
 * Gère les clics sur la carte pour propager la position du pin de livraison.
 */
function ClickHandler({ onChange }: { onChange: (p: GeolocationPoint) => void }) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/**
 * Carte interactive de sélection du point de livraison GPS.
 *
 * @param value   - Position GPS courante (null tant que l'utilisateur n'a rien choisi).
 * @param onChange- Callback appelé à chaque changement de position.
 * @returns Le conteneur de carte Leaflet.
 */
export default function LocationMap({
  value,
  onChange,
}: {
  value: GeolocationPoint | null;
  onChange: (p: GeolocationPoint) => void;
}) {
  // Centre par défaut sur Cotonou (à adapter au dépôt). Dépend de env.HUB_*.
  const center = value ?? { lat: 6.3703, lng: 2.3912 };

  return (
    <div className="map" role="application" aria-label="Carte de sélection du point de livraison">
      <MapContainer
        center={center}
        zoom={value ? 15 : 12}
        scrollWheelZoom
        className="map-canvas"
      >
        {/* Fond cartographique OpenStreetMap : gratuit, sans clé API. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        {value && (
          <Marker
            position={value}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const marker = event.target as L.Marker;
                const point = marker.getLatLng();
                onChange({ lat: point.lat, lng: point.lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}