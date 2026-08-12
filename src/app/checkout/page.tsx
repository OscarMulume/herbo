// ==============================================================================
// app/checkout/page.tsx — Page de commande
// ------------------------------------------------------------------------------
// Export statique (GitHub Pages) : aucune requête serveur. Le formulaire de
// commande (composant client) charge lui-même les produits et zones de
// livraison via le client navigateur (lectures RLS publiques).
// ==============================================================================

import { CheckoutForm } from '@/components/checkout/CheckoutForm';

/**
 * Page de commande : rend le parcours de checkout (chargement client).
 *
 * @returns La vue du parcours de commande.
 */
export default function CheckoutPage() {
  return (
    <main className="page">
      <CheckoutForm />
    </main>
  );
}
