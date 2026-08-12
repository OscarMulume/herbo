'use client';

// ==============================================================================
// components/cart/CartProvider.tsx — État global du panier + Optimistic UI
// ------------------------------------------------------------------------------
// Rôle :
//   * Conserver les quantités du panier (produit -> quantité) en mémoire.
//   * Persister dans localStorage (hydratation au montage, unique côté client).
//   * Exposer des actions addToCart / updateQuantity / clearCart utilisées par
//     les composants UI. L'ajout est OPTIMISTIQUE : le retour visuel est
//     immédiat, sans attendre le réseau.
// ==============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppError } from '@/lib/utils/errors';
import { clientLogger } from '@/lib/utils/logger';

/** Valeur exposée par le contexte du panier. */
interface CartContextValue {
  /** Quantités : identifiant produit -> quantité. */
  items: Record<string, number>;
  /** Ajoute `quantity` au panier (optimistic). */
  addToCart: (productId: string, quantity?: number) => void;
  /** Fixe la quantité d'un produit (0 = retire le produit). */
  updateQuantity: (productId: string, quantity: number) => void;
  /** Vide complètement le panier. */
  clearCart: () => void;
}

const STORAGE_KEY = 'cart:v1';
const MAX_QUANTITY_PER_ITEM = 99;

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Fournisseur global du panier. À placer près de la racine de l'application.
 *
 * @param children - Contenu à envelopper.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({});

  // Hydratation depuis le stockage local (uniquement après montage client).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as Record<string, number>);
    } catch (error) {
      clientLogger.warn('cart.hydration', { error });
    }
  }, []);

  /** Persiste les quantités (échec silencieux pour éviter de bloquer l'UI). */
  const persist = useCallback((next: Record<string, number>) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      clientLogger.warn('STORAGE_UNWRITABLE', { error });
    }
  }, []);

  /** Ajoute une quantité à un produit (capé à MAX_QUANTITY_PER_ITEM). */
  const addToCart = useCallback(
    (productId: string, quantity = 1) => {
      setItems((prev) => {
        const next = {
          ...prev,
          [productId]: Math.min((prev[productId] ?? 0) + quantity, MAX_QUANTITY_PER_ITEM),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** Fixe la quantité ; retire le produit si elle tombe à 0 ou moins. */
  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      setItems((prev) => {
        const next = { ...prev };
        if (quantity <= 0) {
          delete next[productId];
        } else {
          next[productId] = Math.min(quantity, MAX_QUANTITY_PER_ITEM);
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** Vide le panier persistant. */
  const clearCart = useCallback(() => {
    setItems({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      clientLogger.warn('STORAGE_CLEAR', { error });
    }
  }, []);

  const value = useMemo(
    () => ({ items, addToCart, updateQuantity, clearCart }),
    [items, addToCart, updateQuantity, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Accède au contexte du panier.
 *
 * @returns Le panier et ses actions.
 * @throws {AppError} si utilisé hors d'un CartProvider.
 */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new AppError('CART_CONTEXT_MISSING', 'useCart doit être utilisé au sein d\'un CartProvider.');
  }
  return ctx;
}