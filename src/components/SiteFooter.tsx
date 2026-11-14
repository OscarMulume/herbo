// ==============================================================================
// components/SiteFooter.tsx — Pied de page global (copyright + mentions légales)
// ------------------------------------------------------------------------------
// Composant serveur : affiche l'attribution légale et le lien vers les mentions
// légales. Accessible (landmark <footer>) et cohérent avec le thème sombre.
// ==============================================================================

import Link from 'next/link';

/** Année de copyright (figée pour l'export statique). */
const COPYRIGHT_YEAR = 2026;
/** Nom affiché dans le copyright : la marque, pas le nom personnel (décision d'Oscar, 13/11/2026). L'éditeur légal reste dans les mentions légales. */
const BRAND = 'Herbo';

/**
 * Pied de page : copyright, crédits et lien légal.
 *
 * @returns Le pied de page global de l'application.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-brand">Herbo · Remèdes &amp; produits de santé naturels</p>
        <p className="site-footer-credit">
          © {COPYRIGHT_YEAR} {BRAND}. Tous droits réservés.
        </p>
        <nav aria-label="Liens légaux" className="site-footer-nav">
          <Link href="/mentions-legales" className="site-link">
            Mentions légales
          </Link>
          <Link href="/dashboard" className="site-link site-link-quiet">
            Espace vendeur
          </Link>
        </nav>
      </div>
    </footer>
  );
}