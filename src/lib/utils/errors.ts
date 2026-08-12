// ==============================================================================
// lib/utils/errors.ts — Erreur applicative frontend standardisée
// ------------------------------------------------------------------------------
// But : objets d'erreur uniformes, affichables dans l'UI, avec un code stable
// pouvant être utilisé par le frontend pour prendre des décisions ciblées.
// ==============================================================================

/**
 * Erreur applicative du frontend.
 *
 * @example
 *   throw new AppError('INSUFFICIENT_STOCK', 'Stock insuffisant pour ce produit.');
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

/**
 * Fabrique un message lisible pour l'utilisateur à partir d'une erreur inconnue.
 *
 * @param error - Erreur capturée (AppError, Error, ou valeur quelconque).
 * @returns Un message sûr à afficher (jamais de stack ni de données sensibles).
 */
export function toFriendlyMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return 'Une erreur inattendue est survenue. Veuillez réessayer.';
  return 'Une erreur inattendue est survenue. Veuillez réessayer.';
}