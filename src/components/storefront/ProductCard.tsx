// ==============================================================================
// components/storefront/ProductCard.tsx — Carte produit (Server Component)
// ------------------------------------------------------------------------------
// Rendu côté serveur (RSC) : aucune interactivité requise pour le contenu, donc
// aucun JavaScript client n'est chargé pour la carte elle-même. Seul le bouton
// d'ajout (composant client isolé) hydrate le panier.
// ==============================================================================

import { AddToCartButton } from './AddToCartButton';
import { ProductImage } from './ProductImage';
import { formatMoney } from '@/lib/utils/formatters';
import type { Product } from '@/types';

/** Props du composant. */
export interface ProductCardProps {
  product: Product;
  /** Priorise le chargement de l'image (première rangée). */
  priority?: boolean;
}

/**
 * Carte de présentation d'un produit du catalogue.
 *
 * @param {ProductCardProps.product}   - Produit à afficher.
 * @param {ProductCardProps.priority}  - Priorise l'image si en haut de page.
 * @returns La carte produit complète.
 */
export function ProductCard({ product, priority = false }: ProductCardProps) {
  return (
    <article className="product-card">
      <ProductImage src={product.images[0]} alt={product.name} priority={priority} />

      <div className="product-body">
        {product.category && <span className="product-category">{product.category.name}</span>}
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.benefits ?? product.description}</p>

        <div className="product-footer">
          <span className="product-price">{formatMoney(product.price)}</span>
          <AddToCartButton productId={product.id} stock={product.stockQuantity} />
        </div>
      </div>
    </article>
  );
}