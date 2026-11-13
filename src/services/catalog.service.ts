// ==============================================================================
// services/catalog.service.ts — Catalogue hybride (en ligne d'abord, secours local)
// ------------------------------------------------------------------------------
// 1. Essaie la base Supabase (catalogue vivant, commande en ligne).
// 2. Si la base est absente, lente (> 6 s) ou en erreur : catalogue local et
//    commande par WhatsApp. La boutique reste utilisable sur une connexion faible.
// ==============================================================================

import { env } from '@/lib/config/env';
import { createBrowserClient } from '@/lib/supabase/client';
import { getActiveProducts } from '@/services/data/product.repository';
import { clientLogger } from '@/lib/utils/logger';
import { LOCAL_CATALOG, LOCAL_CATALOG_IS_DEMO } from '@/data/catalog';
import type { Product } from '@/types';

export type CatalogSource = 'online' | 'local';

export interface CatalogResult {
  products: Product[];
  source: CatalogSource;
  isDemo: boolean;
}

const TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('catalog_timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Charge le catalogue : base en ligne si disponible, sinon catalogue local (commande WhatsApp). */
export async function loadCatalog(): Promise<CatalogResult> {
  if (env.supabaseUrl && env.supabaseAnonKey) {
    try {
      const products = await withTimeout(getActiveProducts(createBrowserClient()), TIMEOUT_MS);
      if (products.length > 0) return { products, source: 'online', isDemo: false };
    } catch (error) {
      clientLogger.warn('catalog.online_unavailable', { message: (error as Error).message });
    }
  }
  return { products: LOCAL_CATALOG, source: 'local', isDemo: LOCAL_CATALOG_IS_DEMO };
}
