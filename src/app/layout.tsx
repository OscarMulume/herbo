// ==============================================================================
// app/layout.tsx — Layout racine de l'application
// ==============================================================================

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { SiteNav } from '@/components/nav/SiteNav';
import './globals.css';

/** Métadonnées SEO globales du site. */
export const metadata: Metadata = {
  title: {
    default: 'Remèdes & Produits de santé naturels',
    template: '%s · Remèdes et Produits naturels',
  },
  description:
    'E-commerce de remèdes traditionnels, huiles essentielles et produits de santé artisanaux, avec livraison à domicile.',
};

/**
 * Layout racine : fournisseurs globaux (panier) + langue + diffusion du style.
 * @param children - Contenu de la route active.
 * @returns La structure HTML globale.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          <SiteNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}