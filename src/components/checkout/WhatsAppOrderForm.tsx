'use client';

// ==============================================================================
// components/checkout/WhatsAppOrderForm.tsx — Commande par WhatsApp (mode hybride)
// ------------------------------------------------------------------------------
// Affiché quand la base en ligne n'est pas disponible : le client remplit ses
// coordonnées, puis WhatsApp s'ouvre avec la commande déjà rédigée. Rien n'est
// envoyé à un serveur Herbo ; on n'annonce jamais « commande envoyée » : c'est le
// client qui appuie sur Envoyer dans WhatsApp.
// ==============================================================================

import { useState } from 'react';
import type { FormEvent } from 'react';
import { formatMoney } from '@/lib/utils/formatters';
import { buildOrderMessage, whatsappOrderLink } from '@/lib/whatsapp/order';
import type { Product } from '@/types';

/** Moyens de paiement réellement disponibles en RDC. */
const PAYMENTS = ['M-Pesa', 'Airtel Money', 'Orange Money', 'Afrimoney', 'Espèces à la livraison'];

export interface WhatsAppOrderFormProps {
  lines: { product: Product; quantity: number }[];
  total: number;
  onOpened?: () => void;
}

export function WhatsAppOrderForm({ lines, total, onOpened }: WhatsAppOrderFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState(PAYMENTS[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (lines.length === 0) return setError('Votre panier est vide.');
    if (name.trim().length < 2) return setError('Indiquez votre nom.');
    if (phone.replace(/[^\d]/g, '').length < 9) return setError('Indiquez un numéro de téléphone valide.');
    if (address.trim().length < 5) return setError("Indiquez l'adresse de livraison (commune, quartier, avenue).");

    const message = buildOrderMessage({
      lines: lines.map(({ product, quantity }) => ({ name: product.name, quantity, unitPrice: product.price })),
      customerName: name,
      customerPhone: phone,
      address,
      payment,
      notes,
    });
    const link = whatsappOrderLink(message);
    if (!link) return setError('Le numéro WhatsApp de la boutique est indisponible. Réessayez plus tard.');
    window.open(link, '_blank', 'noopener,noreferrer');
    setOpened(true);
    onOpened?.();
  }

  return (
    <section className="checkout" aria-labelledby="wa-title">
      <h1 id="wa-title">Commander par WhatsApp</h1>
      <p className="hero-sub">
        Remplissez vos coordonnées : WhatsApp s&apos;ouvre avec votre commande déjà rédigée. Il vous reste à appuyer sur
        Envoyer. Le prix de la livraison vous est confirmé dans la conversation.
      </p>

      <ul className="cart-lines">
        {lines.map(({ product, quantity }) => (
          <li key={product.id}>
            {quantity} × {product.name} — {formatMoney(product.price * quantity)}
          </li>
        ))}
      </ul>
      <p><strong>Total articles : {formatMoney(total)}</strong></p>

      <form className="wa-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="wa-name">Nom complet</label>
        <input id="wa-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="wa-phone">Téléphone</label>
        <input id="wa-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+243…" value={phone} onChange={(e) => setPhone(e.target.value)} required />

        <label htmlFor="wa-address">Adresse de livraison</label>
        <textarea id="wa-address" autoComplete="street-address" placeholder="Commune, quartier, avenue, numéro, point de repère" value={address} onChange={(e) => setAddress(e.target.value)} required />

        <label htmlFor="wa-payment">Paiement souhaité</label>
        <select id="wa-payment" value={payment} onChange={(e) => setPayment(e.target.value)}>
          {PAYMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <label htmlFor="wa-notes">Remarque (facultatif)</label>
        <textarea id="wa-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && <p className="field-error" role="alert">{error}</p>}
        {opened && (
          <p role="status">
            WhatsApp a été ouvert. Votre commande n&apos;est transmise qu&apos;après avoir appuyé sur Envoyer dans WhatsApp.
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={lines.length === 0}>
          Ouvrir WhatsApp · {formatMoney(total)}
        </button>
      </form>
    </section>
  );
}
