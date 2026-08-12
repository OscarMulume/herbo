'use client';

// ==============================================================================
// components/cart/CartLink.tsx — Accès au panier avec compteur (badge)
// ------------------------------------------------------------------------------
// Composant client minimal : lit le contexte panier pour afficher le nombre
// d'articles, et navigue vers le checkout.
// ==============================================================================

import Link from 'next/link';
import { useCart } from '@/components/cart/CartProvider';

/**
 * Lien "Panier" avec compteur d'articles (retour immédiat de l'optimistic UI).
 *
 * @returns Un lien accessible vers /checkout.
 */
export function CartLink() {
  const { items } = useCart();
  const count = Object.values(items).reduce((sum, quantity) => sum + quantity, 0);

  return (
    <Link href="/checkout" className="btn btn-cart" aria-label={`Voir mon panier (${count} article(s))`}>
      Panier ({count})
    </Link>
  );
}