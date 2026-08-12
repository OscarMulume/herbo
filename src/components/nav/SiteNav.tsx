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
  { href: '/dashboard', label: 'Dashboard' },
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
        <span className="brand">HerboShop</span>
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