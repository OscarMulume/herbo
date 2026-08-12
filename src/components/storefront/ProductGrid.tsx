// ==============================================================================
// components/storefront/ProductGrid.tsx — Grille produits + squelette de charge
// ------------------------------------------------------------------------------
// Server Components natifs : la grille est rendue côté serveur et diffusée en
// streaming (Suspense) avec un squelette de chargement côté client.
// ==============================================================================

import { ProductCard } from './ProductCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Product } from '@/types';

/** Props de la grille. */
export interface ProductGridProps {
  products: Product[];
}

/**
 * Grille responsive des produits du catalogue.
 *
 * @param {ProductGridProps.products} - Produits à afficher.
 * @returns La grille de cartes produits.
 */
export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return <p className="hint">Aucun produit disponible pour le moment.</p>;
  }

  return (
    <div className="product-grid">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 3} />
      ))}
    </div>
  );
}

/**
 * Squelette de chargement de la grille (affiché pendant le streaming SSR).
 *
 * @param count - Nombre de cartes factices.
 */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="product-card" key={index}>
          <div className="product-media">
            <Skeleton className="product-img-skeleton" />
          </div>
          <div className="product-body">
            <Skeleton className="line-skeleton short" />
            <Skeleton className="line-skeleton" />
            <Skeleton className="line-skeleton" />
            <div className="product-footer">
              <Skeleton className="line-skeleton short" />
              <Skeleton className="btn-skeleton" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}