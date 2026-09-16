// ==============================================================================
// components/SiteFooter.tsx — Pied de page global (copyright + mentions légales)
// ------------------------------------------------------------------------------
// Composant serveur : affiche l'attribution légale et le lien vers les mentions
// légales. Accessible (landmark <footer>) et cohérent avec le thème sombre.
// ==============================================================================

import Link from 'next/link';

/** Année de copyright (figée pour l'export statique). */
const COPYRIGHT_YEAR = 2026;
/** Éditeur du site. */
const PUBLISHER = 'Mulume Izuba Oscar';

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
          © {COPYRIGHT_YEAR} {PUBLISHER}. Tous droits réservés.
        </p>
        <nav aria-label="Liens légaux" className="site-footer-nav">
          <Link href="/mentions-legales" className="site-link">
            Mentions légales
          </Link>
        </nav>
      </div>
    </footer>
  );
}