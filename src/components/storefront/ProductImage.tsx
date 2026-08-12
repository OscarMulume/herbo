// ==============================================================================
// components/storefront/ProductImage.tsx — Image produit optimisée (next/image)
// ------------------------------------------------------------------------------
// Usage de next/image :
//   * Chargement différé (lazy) sauf pour les images au-dessus de la ligne de
//     flottaison (priority), visant l'UX et le LCP.
//   * `sizes` pavé responsif pour choisir la bonne résolution par breakpoint.
//   * next/image délivre automatiquement WebP/AVIF et dimensionne/cache via le
//     loader intégré (domaine supabase.co autorisé dans next.config).
//   * Gestion d'un placeholder accessible si l'image est absente.
// ==============================================================================

import Image from 'next/image';
import { getSupabasePublicUrl } from '@/lib/utils/images';

/** Props du composant. */
export interface ProductImageProps {
  /** Chemin de l'objet dans le bucket produits (source primaire). */
  src?: string | null;
  /** Texte alternatif (accessibilité). */
  alt: string;
  /** Priorise le chargement (true pour la première ligne de flottaison). */
  priority?: boolean;
}

/**
 * Affiche l'image d'un produit avec l'optimisation next/image.
 *
 * @param {ProductImageProps.src}      - Chemin dans le bucket produits.
 * @param {ProductImageProps.alt}      - Description accessible.
 * @param {ProductImageProps.priority} - Chargement immédiat vs différé.
 * @returns L'image responsive, ou un placeholder accessible si aucune source.
 */
export function ProductImage({ src, alt, priority = false }: ProductImageProps) {
  const url = src ? getSupabasePublicUrl(src) : null;

  if (!url) {
    return (
      <div className="product-media">
        <div className="product-img placeholder" role="img" aria-label={alt} />
      </div>
    );
  }

  return (
    <div className="product-media">
      <Image
        src={url}
        alt={alt}
        fill
        // Tailles/sources responsives : 1 colonne mobile, multi en tablette/desktop.
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        loading={priority ? 'eager' : 'lazy'}
        priority={priority}
        className="product-img"
      />
    </div>
  );
}