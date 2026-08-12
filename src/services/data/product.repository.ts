// ==============================================================================
// services/data/product.repository.ts — Dépôt de données : produits
// ------------------------------------------------------------------------------
// Rôle : UNIQUE point d'accès aux données produits. La couche UI et les
// services ne connaissent jamais Supabase directement (Pattern Repository).
// En cas de migration (autre SGBD / backend), seule cette classe change.
//
// Les réponses sont normalisées : toute erreur est transformée en AppError
// avec un code stable et un message sûr à afficher.
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/utils/errors';
import { clientLogger } from '@/lib/utils/logger';
import type { Product } from '@/types';

/** Mapping ligne DB (snake_case) -> domaine (camelCase). */
function mapRowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    categoryId: row.category_id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    benefits: (row.benefits as string | null) ?? null,
    dosage: (row.dosage as string | null) ?? null,
    price: Number(row.price),
    stockQuantity: Number(row.stock_quantity),
    images: (row.images as string[]) ?? [],
    isActive: Boolean(row.is_active),
    category: row.categories
      ? {
          name: (row.categories as { name?: string }).name ?? '',
          slug: (row.categories as { slug?: string }).slug ?? '',
        }
      : undefined,
  };
}

/**
 * Récupère la liste des produits actifs (avec leur catégorie) pour la boutique.
 *
 * @param client - Client Supabase injecté (browser en export statique, ou serveur).
 *                 Obligatoire : supprime toute dépendance au runtime serveur.
 * @returns La liste des produits actifs.
 * @throws {AppError} PRODUCTS_FETCH_FAILED en cas d'échec d'accès aux données.
 */
export async function getActiveProducts(
  client: SupabaseClient,
): Promise<Product[]> {
  try {
    const { data, error } = await client
      .from('products')
      .select('*, categories(name, slug)')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapRowToProduct);
  } catch (error) {
    clientLogger.error('productRepository.getActiveProducts', { error });
    throw new AppError('PRODUCTS_FETCH_FAILED', 'Impossible de charger les produits.', { cause: error });
  }
}

/**
 * Récupère un produit par son slug (page produit, SEO-friendly).
 *
 * @param slug   - Identifiant lisible du produit.
 * @param client - Client Supabase injecté (défaut : client serveur).
 * @returns Le produit ou null s'il n'existe pas / est inactif.
 * @throws {AppError} PRODUCTS_FETCH_FAILED en cas d'échec d'accès aux données.
 */
export async function getProductBySlug(
  slug: string,
  client: SupabaseClient,
): Promise<Product | null> {
  try {
    const { data, error } = await client
      .from('products')
      .select('*, categories(name, slug)')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    return data ? mapRowToProduct(data) : null;
  } catch (error) {
    clientLogger.error('productRepository.getProductBySlug', { slug, error });
    throw new AppError('PRODUCTS_FETCH_FAILED', 'Impossible de charger le produit.', { cause: error });
  }
}