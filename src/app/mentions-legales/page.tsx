// ==============================================================================
// app/mentions-legales/page.tsx — Mention légales
// ------------------------------------------------------------------------------
// Page statique (export GitHub Pages) : informations légales de la boutique
// Herbo, éditées par Mulume Izuba Oscar. Structure sémantique accessible.
// ==============================================================================

import type { Metadata } from 'next';

/** Métadonnées SEO de la page. */
export const metadata: Metadata = {
  title: 'Mentions légales',
  description: "Informations légales du site Herbo, édité par Mulume Izuba Oscar.",
};

/**
 * Page des mentions légales.
 *
 * @returns Le contenu légal de la boutique.
 */
export default function MentionsLegalesPage() {
  return (
    <main className="legal">
      <article>
        <h1>Mentions légales</h1>
        <p className="legal-updated">Dernière mise à jour : 16/09/2026</p>

        <section>
          <h2>1. Éditeur du site</h2>
          <p>
            Le site <strong>Herbo</strong> (boutique en ligne de remèdes traditionnels et produits de
            santé naturels) est édité par :
          </p>
          <p>
            <strong>Mulume Izuba Oscar</strong><br />
            Développeur indépendant et éditeur de solutions logicielles.
          </p>
          <p>
            Contact : la demande doit être adressée via le formulaire de commande du site ou l&apos;adresse
            électronique communiquée lors de l&apos;achat.
          </p>
        </section>

        <section>
          <h2>2. Hébergement</h2>
          <p>
            Le site est hébergé sur une infrastructure de publication statique sécurisée. Les données de
            catalogue sont stockées sur un service d&apos;hébergement de données cloud (Supabase) dans des
            emplacements respectant la législation applicable.
          </p>
        </section>

        <section>
          <h2>3. Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble des éléments du site (structure, textes, interfaces, logo, code source,
            photographies) est la propriété exclusive de <strong>Mulume Izuba Oscar</strong> ou de ses
            ayants droit. Toute reproduction, représentation ou exploitation, totale ou partielle, sans
            autorisation préalable écrite est interdite.
          </p>
        </section>

        <section>
          <h2>4. Données personnelles et cookies</h2>
          <p>
            Le site utilise le stockage local de l&apos;appareil (localStorage) pour le fonctionnement du
            panier et des préférences d&apos;affichage. Aucune donnée personnelle n&apos;est revendue à des tiers.
          </p>
        </section>

        <section>
          <h2>5. Droit applicable et juridiction</h2>
          <p>
            Le présent site et son utilisation sont régis par le droit applicable au lieu d&apos;établissement
            de l&apos;éditeur. En cas de litige, une solution amiable sera recherchée préalablement à toute
            action judiciaire devant la juridiction compétente.
          </p>
        </section>
      </article>
    </main>
  );
}