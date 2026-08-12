'use client';

// ==============================================================================
// app/page.tsx — Boutique (Storefront)
// ------------------------------------------------------------------------------
// Export statique (GitHub Pages) : plus de Server Components ni de streaming RSC.
// Le catalogue est chargé CÔTÉ CLIENT via le client navigateur (lectures RLS
// publiques), avec un squelette pendant le chargement. L'interactivité (ajout
// au panier, compteur) reste isolée dans de petits composants clients.
// ==============================================================================

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { getActiveProducts } from '@/services/data/product.repository';
import { toFriendlyMessage } from '@/lib/utils/errors';
import { ProductGrid, ProductGridSkeleton } from '@/components/storefront/ProductGrid';
import type { Product } from '@/types';

/**
 * Page d'accueil : hero + catalogue chargé côté client (squelette en attente).
 *
 * @returns La vue storefront de la boutique.
 */
export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await getActiveProducts(createBrowserClient());
        if (!cancelled) setProducts(list);
      } catch (err) {
        if (!cancelled) setError(toFriendlyMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="home">
      <section className="hero">
        <h1>Remèdes traditionnels &amp; produits de santé artisanaux</h1>
        <p className="hero-sub">
          Commandez et faites-vous livrer à domicile par votre réseau de livreurs.
        </p>
      </section>

      <section className="catalog" aria-labelledby="catalog-title">
        <h2 id="catalog-title">Notre catalogue</h2>
        {error ? (
          <p className="field-error" role="alert">{error}</p>
        ) : loading ? (
          <ProductGridSkeleton />
        ) : (
          <ProductGrid products={products} />
        )}
      </section>
    </main>
  );
}
