'use client';

// ==============================================================================
// components/storefront/AddToCartButton.tsx — Bouton "Ajouter au panier"
// ------------------------------------------------------------------------------
// Comportement OPTIMISTIC UI :
//   * L'ajout est immédiat (pas d'attente réseau) : retour "Ajouté ✓" pendant
//     1,5 s, puis retour à l'état nominal.
//   * Désactivé proprement en cas de rupture de stock.
// ==============================================================================

import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';

/** Props du composant. */
export interface AddToCartButtonProps {
  productId: string;
  /** Stock disponible (<= 0 => rupture). */
  stock: number;
}

/**
 * Bouton d'ajout au panier avec retour optimiste.
 *
 * @param {AddToCartButtonProps.productId} - Produit concerné.
 * @param {AddToCartButtonProps.stock}     - Stock restant.
 */
export function AddToCartButton({ productId, stock }: AddToCartButtonProps) {
  const { addToCart } = useCart();
  const [added, setAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outOfStock = stock <= 0;

  /** Réinitialise le minuteur du retour visuel au démontage. */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Ajoute de manière optimiste puis masque le retour après 1,5 s. */
  const handleAdd = () => {
    if (outOfStock) return;
    addToCart(productId, 1);
    setAdded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAdded(false), 1500);
  };

  return (
    <button
      type="button"
      className={`btn btn-add${added ? ' added' : ''}`}
      onClick={handleAdd}
      disabled={outOfStock}
      aria-label={outOfStock ? `Produit ${productId} : en rupture de stock` : `Ajouter au panier le produit ${productId}`}
    >
      {outOfStock ? 'Rupture' : added ? 'Ajouté ✓' : 'Ajouter au panier'}
    </button>
  );
}