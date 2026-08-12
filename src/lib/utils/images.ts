// ==============================================================================
// lib/utils/images.ts — Réseautage des images produits (Supabase Storage)
// ==============================================================================

import { env } from '@/lib/config/env';

/** Nom du bucket de stockage des images produits. */
const PRODUCTS_BUCKET = 'products';

/**
 * Construit une URL publique vers une image du bucket produits.
 *
 * @param path - Chemin relatif de l'objet dans le bucket (ex: "he/huile-eucalyptus.webp").
 * @returns L'URL publique absolue utilisable par <Image> de next/image.
 */
export function getSupabasePublicUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${env.supabaseUrl}/storage/v1/object/public/${PRODUCTS_BUCKET}/${clean}`;
}