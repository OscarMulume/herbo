'use client';

// ==============================================================================
// components/checkout/LocationPicker.tsx — Saisie de la localisation GPS
// ------------------------------------------------------------------------------
// Objectif : répondre au besoin de logistique de précision. Les adresses ne
// sont pas standardisées en Afrique de l'Ouest : on fournit donc un Pin GPS
// (latitude / longitude) en complément d'une adresse texte.
//
// Mécanismes offerts :
//   * Bouton "Utiliser ma position GPS" (API navigateur: navigator.geolocation).
//   * Carte Leaflet déplaçable (import dynamique, rendu client uniquement).
//   * Saisie manuelle des coordonnées en cas de carte indisponible.
// ==============================================================================

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { GeolocationPoint } from '@/types';

// La carte est chargée uniquement côté client ({ ssr: false }) car Leaflet
// dépend de l'objet `window` et du DOM.
const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => <p className="map-loading">Chargement de la carte…</p>,
});

/** Props du composant. */
export interface LocationPickerProps {
  /** Position GPS courante (ou null si non encore choisie). */
  value: GeolocationPoint | null;
  /** Callback appelé à chaque mise à jour de la position. */
  onChange: (point: GeolocationPoint) => void;
  /** Message d'erreur éventuel (remonté du formulaire). */
  error?: string | null;
}

/**
 * Widget de saisie de la localisation de livraison (Pin GPS + texte).
 *
 * @param props.value  - Position GPS courante.
 * @param props.onChange - Met à jour la position dans le formulaire parent.
 * @param props.error  - Erreur d'affichage éventuelle.
 * @returns Le bloc de saisie de localisation.
 */
export function LocationPicker({ value, onChange, error }: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  /** Récupère la position GPS courante du navigateur (géolocalisation). */
  const handleUseMyLocation = () => {
    setLocating(true);
    setGpsError(null);

    // Navigateur incompatible.
    if (!('geolocation' in navigator)) {
      setGpsError("La géolocalisation n'est pas supportée par votre navigateur.");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Succès : on propage la position vers le formulaire.
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        // Erreur documentée : code 1 = refus de permission, 2 = indisponible, 3 = timeout.
        setGpsError(
          err.code === 1
            ? "Autorisation de localisation refusée."
            : "Impossible d'obtenir votre position. Entrez les coordonnées manuellement.",
        );
        setLocating(false);
      },
      // Précision optimale + faible cache (souhaitable pour une livraison précise).
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  /** Met à jour uniquement la latitude (saisie manuelle). */
  const updateLatitude = (raw: string) => {
    const lat = Number(raw);
    if (!Number.isNaN(lat)) onChange({ lat, lng: value?.lng ?? 0 });
  };

  /** Met à jour uniquement la longitude (saisie manuelle). */
  const updateLongitude = (raw: string) => {
    const lng = Number(raw);
    if (!Number.isNaN(lng)) onChange({ lat: value?.lat ?? 0, lng });
  };

  return (
    <div className="location-picker">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleUseMyLocation}
        disabled={locating}
      >
        {locating ? 'Localisation en cours…' : 'Utiliser ma position GPS'}
      </button>

      <p className="hint">
        Déplacez le pin sur la carte pour affiner votre position, ou saisissez les coordonnées
        ci-dessous.
      </p>

      <LocationMap value={value} onChange={onChange} />

      <div className="coords-fields">
        <label>
          Latitude
          <input
            type="number"
            step="any"
            inputMode="decimal"
            min={-90}
            max={90}
            value={value?.lat ?? ''}
            onChange={(e) => updateLatitude(e.target.value)}
            placeholder="6.3703"
          />
        </label>
        <label>
          Longitude
          <input
            type="number"
            step="any"
            inputMode="decimal"
            min={-180}
            max={180}
            value={value?.lng ?? ''}
            onChange={(e) => updateLongitude(e.target.value)}
            placeholder="2.3912"
          />
        </label>
      </div>

      {(error || gpsError) && <p className="field-error">{error ?? gpsError}</p>}
    </div>
  );
}