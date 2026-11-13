import { describe, expect, it } from 'vitest';
import { buildOrderMessage, whatsappOrderLink } from '@/lib/whatsapp/order';

describe('commande WhatsApp', () => {
  const input = {
    lines: [
      { name: 'Herbe de citronnelle', quantity: 2, unitPrice: 1 },
      { name: 'Camomille', quantity: 1, unitPrice: 10 },
    ],
    customerName: ' Jean ',
    customerPhone: '+243 970 000 000',
    address: 'Gombe, avenue X',
    payment: 'M-Pesa',
    notes: '',
  };

  it('liste les articles, le total et les coordonnées', () => {
    const msg = buildOrderMessage(input);
    expect(msg).toContain('2 × Herbe de citronnelle — $2');
    expect(msg).toContain('Total articles : $12');
    expect(msg).toContain('Nom : Jean');
    expect(msg).toContain('Paiement souhaité : M-Pesa');
    expect(msg).not.toContain('Remarque');
  });

  it('construit un lien wa.me encodé', () => {
    const link = whatsappOrderLink('Bonjour & merci', '+243 975 585 150');
    expect(link).toBe('https://wa.me/243975585150?text=Bonjour%20%26%20merci');
  });

  it('refuse un numéro invalide', () => {
    expect(whatsappOrderLink('x', '12')).toBeNull();
  });
});
