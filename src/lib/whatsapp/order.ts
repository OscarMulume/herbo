// ==============================================================================
// lib/whatsapp/order.ts — Commande par WhatsApp (mode hybride, sans base)
// ------------------------------------------------------------------------------
// Fonctions pures et testées : construction du message et du lien wa.me.
// Aucune donnée n'est envoyée à un serveur : le client ouvre WhatsApp et envoie
// lui-même le message (pas de traçage, pas de stockage côté Herbo).
// ==============================================================================

import { formatMoney } from '@/lib/utils/formatters';

/** Numéro WhatsApp de la boutique (variable de build, sinon numéro confirmé par Oscar le 13/11/2026). */
export const SHOP_WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '+243975585150';

export interface WhatsAppOrderLine {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface WhatsAppOrderInput {
  lines: WhatsAppOrderLine[];
  customerName: string;
  customerPhone: string;
  address: string;
  payment: string;
  notes?: string;
}

/** Message de commande lisible, prêt à être envoyé au vendeur. */
export function buildOrderMessage(input: WhatsAppOrderInput): string {
  const total = input.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const lines = input.lines.map((l) => `• ${l.quantity} × ${l.name} — ${formatMoney(l.unitPrice * l.quantity)}`);
  return [
    'Bonjour Herbo, je souhaite commander :',
    ...lines,
    `Total articles : ${formatMoney(total)} (livraison à confirmer)`,
    '',
    `Nom : ${input.customerName.trim()}`,
    `Téléphone : ${input.customerPhone.trim()}`,
    `Adresse de livraison : ${input.address.trim()}`,
    `Paiement souhaité : ${input.payment}`,
    ...(input.notes && input.notes.trim() ? [`Remarque : ${input.notes.trim()}`] : []),
  ].join('\n');
}

/** Lien wa.me vers la boutique ; null si le numéro est invalide. */
export function whatsappOrderLink(message: string, number: string = SHOP_WHATSAPP): string | null {
  const digits = number.replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
