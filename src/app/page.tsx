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
import { loadCatalog } from '@/services/catalog.service';
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
  const [isDemo, setIsDemo] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const catalog = await loadCatalog();
        if (!cancelled) {
          setProducts(catalog.products);
          setIsDemo(catalog.isDemo);
          setOffline(catalog.source === 'local');
        }
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
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-inner">
          <p className="hero-eyebrow">Herbo · produits naturels</p>
          <h1 id="hero-title">Le naturel, sans vous presser.</h1>
          <p className="hero-sub">
            Remèdes traditionnels, plantes et huiles artisanales. Choisissez tranquillement, commandez en quelques
            secondes, on vous livre à la maison.
          </p>
          <div className="hero-actions">
            <a href="#catalog-title" className="btn btn-primary btn-lg">Voir le catalogue</a>
            <a href="/herbo/checkout/" className="btn btn-ghost btn-lg">Mon panier</a>
          </div>
          <ul className="trust-chips" aria-label="Nos engagements">
            <li>Commande par WhatsApp</li>
            <li>M-Pesa · Airtel · Orange · Afrimoney</li>
            <li>Paiement à la livraison possible</li>
          </ul>
        </div>
      </section>

      <section className="catalog" aria-labelledby="catalog-title">
        <h2 id="catalog-title">Notre catalogue</h2>
        {offline && (
          <p className="notice" role="status">
            Commande par WhatsApp : ajoutez vos articles au panier, puis validez ; WhatsApp s&apos;ouvre avec votre commande.
          </p>
        )}
        {isDemo && (
          <p className="notice" role="note">
            Catalogue en préparation : les articles ci-dessous sont des exemples.
          </p>
        )}
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
