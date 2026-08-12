// ==============================================================================
// lib/utils/formatters.ts — Formatage des montants (devise USD)
// ==============================================================================

/**
 * Formate un montant monétaire en dollars américains (USD, $).
 *
 * @param value - Montant (nombre décimal).
 * @returns Chaîne formatée, ex. "$1" ou "$10".
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}