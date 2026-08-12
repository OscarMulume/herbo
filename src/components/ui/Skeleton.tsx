// ==============================================================================
// components/ui/Skeleton.tsx — Squelettes de chargement (retour visuel neutre)
// ==============================================================================

/**
 * Bloc de chargement skeletton (pulsation légère), sans sémantique accessible :
 * il est masqué des lecteurs d'écran.
 *
 * @param className - Classe pour dimensionner le squelette (ex: hauteur).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}