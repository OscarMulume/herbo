'use client';

// ==============================================================================
// components/checkout/CheckoutForm.tsx — Formulaire de commande (pas de paiement)
// ------------------------------------------------------------------------------
// Composant client orchestrant le parcours de checkout :
//   * Récap du panier (lecture depuis le CONTEXTE panier — Optimistic UI).
//   * Adresse texte + localisation GPS précise (Pin).
//   * Sélection de la zone de livraison (avec squelette pendant le chargement).
//   * Choix du moyen de paiement (Mobile Money / Carte / Espèces à la livraison).
//   * Validation stricte Zod (coordonnées, téléphone, quantités) avant envoi.
//   * Soumission -> Edge Function create_payment_intent -> écran de confirmation.
//
// Architecture découplée : ce composant n'utilise QUE le service de checkout,
// le dépôt des zones et le contexte panier. Il ne touche jamais Supabase direct.
// ==============================================================================

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { clientLogger } from '@/lib/utils/logger';
import { toFriendlyMessage } from '@/lib/utils/errors';
import { formatMoney } from '@/lib/utils/formatters';
import { createBrowserClient } from '@/lib/supabase/client';
import { getActiveDeliveryZones } from '@/services/data/delivery-zone.repository';
import { getActiveProducts } from '@/services/data/product.repository';
import { initiatePayment, type PaymentIntentResult } from '@/services/checkout.service';
import { checkoutFormSchema } from '@/lib/validation/schemas';
import { useCart } from '@/components/cart/CartProvider';
import { Skeleton } from '@/components/ui/Skeleton';
import type { DeliveryZone, GeolocationPoint, PaymentMethod, Product } from '@/types';
import { LocationPicker } from './LocationPicker';

/** Props du composant (aucune dépendance serveur : tout est chargé côté client). */
export interface CheckoutFormProps {}

/** Options de paiement proposées à l'utilisateur. */
const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: 'mobile_money', label: 'Mobile Money', hint: 'MTN MoMo / Moov Money / Orange Money' },
  { value: 'card', label: 'Carte bancaire', hint: 'Visa / Mastercard' },
  { value: 'cash_on_delivery', label: 'Espèces à la livraison', hint: 'Paiement au livreur' },
];

/** Résume le montant d'une ligne du panier (fonction pure, testable). */
export function lineAmount(price: number, quantity: number): number {
  return price * quantity;
}

/**
 * Formulaire de commande et de choix de paiement.
 *
 * @returns Le formulaire complet de checkout.
 */
export function CheckoutForm(_props: CheckoutFormProps) {
  const cart = useCart();
  // Produits actifs (chargés côté client, export statique oblige).
  const [products, setProducts] = useState<Product[]>([]);
  // Le panier : uniquement les produits présents dans le contexte.
  const cartLines = useMemo(
    () =>
      products
        .filter((product) => (cart.items[product.id] ?? 0) > 0)
        .map((product) => ({ product, quantity: cart.items[product.id] })),
    [products, cart.items],
  );

  const itemsTotal = useMemo(
    () => cartLines.reduce((sum, { product, quantity }) => sum + lineAmount(product.price, quantity), 0),
    [cartLines],
  );

  // --- Données de livraison ---
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [deliveryZoneId, setDeliveryZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState<GeolocationPoint | null>(null);

  // --- Paiement ---
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile_money');
  const [phone, setPhone] = useState('');

  // --- Cycle de vie ---
  const [loadingZones, setLoadingZones] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previousError, setPreviousError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentIntentResult | null>(null);

  // Charge les produits actifs (catalogue) côté client.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const availableProducts = await getActiveProducts(createBrowserClient());
        if (!cancelled) setProducts(availableProducts);
      } catch (error) {
        clientLogger.error('checkoutForm.loadProducts', { error });
        if (!cancelled) setPreviousError(toFriendlyMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Charge les zones actives (squelette affiché pendant le chargement).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const availableZones = await getActiveDeliveryZones(createBrowserClient());
        if (cancelled) return;
        setZones(availableZones);
        if (availableZones.length === 1) setDeliveryZoneId(availableZones[0].id);
      } catch (error) {
        clientLogger.error('checkoutForm.loadZones', { error });
        if (!cancelled) setPreviousError(toFriendlyMessage(error));
      } finally {
        if (!cancelled) setLoadingZones(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Valide le formulaire avec Zod (rejet précoce d'une entrée invalide).
   * @returns Un message d'erreur lisible, ou null si tout est valide.
   */
  function validateForm(): string | null {
    if (cartLines.length === 0) return 'Votre panier est vide.';

    const parsed = checkoutFormSchema.safeParse({
      deliveryZoneId: deliveryZoneId || undefined,
      deliveryAddress: address,
      location,
      paymentMethod,
      phone: phone || undefined,
    });

    if (!parsed.success) {
      // Une seule erreur affichée à la fois (première rencontrée par Zod).
      return parsed.error.issues[0]?.message ?? 'Champs invalides.';
    }
    return null;
  }

  /**
   * Soumet le panier : appelle le service de paiement (-> Edge Function).
   * Affiche un écran de confirmation en cas de succès.
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPreviousError(null);

    const formError = validateForm();
    if (formError) {
      setPreviousError(formError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await initiatePayment({
        items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        deliveryZoneId,
        location: location as GeolocationPoint,
        deliveryAddress: address,
        deliveryNotes: notes || null,
        paymentMethod,
        customerPhone: paymentMethod === 'mobile_money' ? phone : undefined,
      });
      setPaymentResult(result);
      // Après une commande réussie, on vide le panier localement.
      cart.clearCart();
      clientLogger.info('checkout.submit — paiement initialisé', { orderId: result.order.id });
    } catch (error) {
      setPreviousError(toFriendlyMessage(error));
      clientLogger.error('checkout.submit: échec', { message: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Écran de confirmation (paiement initialisé) ----------
  if (paymentResult) {
    return (
      <section className="checkout" aria-live="polite">
        <div className="success-banner" role="status">
          <h1>Commande initialisée</h1>
          <p>
            Référence : <strong>{paymentResult.order.number}</strong>
          </p>
          {paymentResult.paymentIntent.provider === 'mobile_money' && (
            <p>Une demande de prélèvement vous a été envoyée. Confirmez-la depuis votre téléphone.</p>
          )}
        </div>

        <dl className="summary-grid">
          <div><dt>Articles</dt><dd>{formatMoney(paymentResult.breakdown.itemsTotal)}</dd></div>
          <div><dt>Livraison</dt><dd>{formatMoney(paymentResult.breakdown.deliveryFee)}</dd></div>
          <div><dt>Total ({paymentResult.breakdown.currency})</dt><dd>{formatMoney(paymentResult.breakdown.totalAmount)}</dd></div>
        </dl>

        <p className="hint">
          Le paiement est confirmé via webhook après validation par l&apos;agrégateur. Un récapitulatif
          vous sera envoyé.
        </p>
      </section>
    );
  }

  // ---------- Formulaire principal ----------
  return (
    <form className="checkout" onSubmit={handleSubmit} noValidate>
      <h1>Finaliser la commande</h1>

      {previousError && <div className="field-error banner" role="alert">{previousError}</div>}

      {/* ----- Récapitulatif du panier ----- */}
      <section className="panel" aria-label="Votre panier">
        <h2>Votre panier</h2>
        {cartLines.length === 0 ? (
          <p className="hint">Votre panier est vide. Retournez au catalogue pour ajouter des articles.</p>
        ) : (
          <ul className="cart-list">
            {cartLines.map(({ product, quantity }) => (
              <li key={product.id} className="cart-row">
                <span className="cart-name">{product.name}</span>
                <div className="cart-quantity">
                  <button type="button" onClick={() => cart.updateQuantity(product.id, quantity - 1)} aria-label={`Retirer un ${product.name}`}>−</button>
                  <span>{quantity}</span>
                  <button type="button" onClick={() => cart.updateQuantity(product.id, quantity + 1)} aria-label={`Ajouter un ${product.name}`}>+</button>
                </div>
                <span className="cart-price">{formatMoney(lineAmount(product.price, quantity))}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="cart-total">
          <span>Sous-total</span>
          <strong>{formatMoney(itemsTotal)}</strong>
        </div>
        <p className="hint">Les frais de livraison sont calculés après sélection de la zone et de votre position.</p>
      </section>

      {/* ----- Livraison : zone + adresse + position GPS ----- */}
      <section className="panel" aria-labelledby="delivery-heading">
        <h2 id="delivery-heading">Livraison</h2>

        <label className="field">
          <span>Zone de livraison</span>
          {loadingZones ? (
            <Skeleton className="field-skeleton" />
          ) : (
            <select
              value={deliveryZoneId}
              onChange={(e) => setDeliveryZoneId(e.target.value)}
            >
              <option value="">Choisir une zone</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          )}
        </label>

        <label className="field">
          <span>Adresse (repère, quartier, maison…)</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ex : Quartier Haie Vive, près de la pharmacie"
          />
        </label>

        {/* Position GPS précise : indispensable lorsque l'adresse n'est pas standardisée. */}
        <LocationPicker value={location} onChange={setLocation} />

        <label className="field">
          <span>Notes de livraison (facultatif)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ex : appelez le livreur avant d'arriver"
          />
        </label>
      </section>

      {/* ----- Moyen de paiement ----- */}
      <section className="panel" aria-labelledby="payment-heading">
        <h2 id="payment-heading">Paiement</h2>
        <div className="payment-options">
          {PAYMENT_OPTIONS.map((option) => (
            <label key={option.value} className={`payment-option${paymentMethod === option.value ? ' active' : ''}`}>
              <input
                type="radio"
                name="payment-method"
                value={option.value}
                checked={paymentMethod === option.value}
                onChange={() => setPaymentMethod(option.value)}
              />
              <span className="payment-label">{option.label}</span>
              <span className="payment-hint">{option.hint}</span>
            </label>
          ))}
        </div>

        {paymentMethod === 'mobile_money' && (
          <label className="field">
            <span>Numéro Mobile Money</span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+229 90000000"
            />
          </label>
        )}

        <button type="submit" className="btn btn-primary" disabled={submitting || cartLines.length === 0}>
          {submitting ? 'Traitement en cours…' : `Commander · ${formatMoney(itemsTotal)}`}
        </button>
      </section>
    </form>
  );
}