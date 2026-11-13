// ==============================================================================
// data/catalog.ts — Catalogue local de secours (mode hybride)
// ------------------------------------------------------------------------------
// Utilisé quand la base Supabase n'est pas joignable (hors ligne, base non encore
// branchée). Ce sont les 3 ARTICLES DE DÉMONSTRATION de supabase/seed.sql, affichés
// avec un bandeau « exemples » : le vrai catalogue d'Oscar est EN ATTENTE.
// Pour publier le vrai catalogue sans base : remplacer cette liste.
// ==============================================================================

import type { Product } from '@/types';

export const LOCAL_CATALOG_IS_DEMO = true;

export const LOCAL_CATALOG: Product[] = [
  {
    id: 'local-herbe-citronnelle',
    categoryId: 'local-produits-du-moment',
    name: 'Herbe de citronnelle',
    slug: 'herbe-citronnelle',
    description: 'Plante aromatique fraîche de démonstration.',
    benefits: 'Infusion agréable, arôme naturel.',
    dosage: '1 poignée en infusion pour un thé.',
    price: 1,
    stockQuantity: 100,
    images: [],
    isActive: true,
    category: { name: 'Produits du moment', slug: 'produits-du-moment' },
  },
  {
    id: 'local-melange-infusion-apaisante-pack',
    categoryId: 'local-produits-du-moment',
    name: "Mélange d'infusion apaisante (un pack)",
    slug: 'melange-infusion-apaisante-pack',
    description: 'Pack de démonstration : mélange de plantes pour infusion.',
    benefits: 'Boisson chaude relaxante en fin de journée.',
    dosage: '1 sachet par tasse, infuser 5 minutes.',
    price: 10,
    stockQuantity: 50,
    images: [],
    isActive: true,
    category: { name: 'Produits du moment', slug: 'produits-du-moment' },
  },
  {
    id: 'local-echantillon-camomille-1-2-dose',
    categoryId: 'local-produits-du-moment',
    name: 'Échantillon 1/2 dose de fleurs de camomille',
    slug: 'echantillon-camomille-1-2-dose',
    description: 'Format découverte 1/2 dose de camomille séchée.',
    benefits: 'Petit format pour découvrir la camomille.',
    dosage: '1 cuillère par tasse, infuser 5 minutes.',
    price: 10,
    stockQuantity: 50,
    images: [],
    isActive: true,
    category: { name: 'Produits du moment', slug: 'produits-du-moment' },
  },
];
