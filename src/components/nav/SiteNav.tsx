'use client';

// ==============================================================================
// components/nav/SiteNav.tsx — Barre de navigation globale
// ------------------------------------------------------------------------------
// Composant client : la navigation doit connaître la route active (usePathname)
// et afficher le compteur du panier (CartLink). Le basePath (/herbo en
// export statique) est géré automatiquement par next/link et usePathname.
// ==============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CartLink } from '@/components/cart/CartLink';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

/** Lien du menu. */
interface NavLink {
  href: string;
  label: string;
}

/** Liens principaux du site (les routes correspondent aux pages statiques). */
const LINKS: NavLink[] = [
  { href: '/', label: 'Boutique' },
  { href: '/checkout', label: 'Commande' },
];

/** Note affichée en tête de boutique pour la rendre accessible. */
const HOME_PATHS = ['/', '/index'];

/**
 * Indique si un lien est actif selon le chemin courant (sans basePath).
 *
 * @param href      - Cible du lien.
 * @param pathname  - Chemin de la route courante.
 * @returns true si le lien correspond à la route active.
 */
function isActive(href: string, pathname: string): boolean {
  if (HOME_PATHS.includes(href)) {
    return HOME_PATHS.includes(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Barre de navigation : marque du site + menu accessible + panier.
 *
 * @returns L'en-tête global de l'application.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Navigation principale">
        <Link href="/" className="brand" aria-label="Herbo, accueil de la boutique">
          <svg className="brand-leaf" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" fill="currentColor" opacity=".9" />
            <path d="M5 19c3-4 6-7 10-9" stroke="var(--herbo-sand)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
          <span>Herbo</span>
        </Link>
        <ul className="site-menu">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`site-link${isActive(link.href, pathname) ? ' active' : ''}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <ThemeToggle />
        <CartLink />
      </nav>
    </header>
  );
}