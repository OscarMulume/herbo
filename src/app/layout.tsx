// ==============================================================================
// app/layout.tsx — Layout racine de l'application
// ==============================================================================

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { SiteNav } from '@/components/nav/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import './globals.css';

/** Métadonnées SEO globales du site + PWA. */
export const metadata: Metadata = {
  title: {
    default: 'Remèdes & Produits de santé naturels',
    template: '%s · Remèdes et Produits naturels',
  },
  description:
    'E-commerce de remèdes traditionnels, huiles essentielles et produits de santé artisanaux, avec livraison à domicile.',
  manifest: '/herbo/manifest.webmanifest',
  themeColor: '#16a34a',
  viewport: 'width=device-width, initial-scale=1',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Herbo' },
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
          <SiteFooter />
        </Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/herbo/sw.js')})}`,
          }}
        />
      </body>
    </html>
  );
}