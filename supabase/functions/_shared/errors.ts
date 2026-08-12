// ==============================================================================
// _shared/errors.ts — Gestion d'erreurs standardisée des Edge Functions
// ------------------------------------------------------------------------------
// But : centraliser la fabrication de réponses d'erreur JSON identiques pour
// tout le projet, et ne JAMAIS exposer les erreurs internes réelles au client.
// ==============================================================================

import { corsHeaders } from './cors.ts';
import { logger } from './logger.ts';

/**
 * Erreur applicative typée, avec un code métier et un statut HTTP.
 * Utilisée pour les situations prévisibles (entrée invalide, stock, auth…).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Convertit n'importe quelle erreur en réponse JSON d'erreur (compatible CORS).
 *
 * - Si l'erreur est une AppError : sa description est renvoyée au client.
 * - Sinon (erreur inattendue) : on journalise le détail côté serveur et on
 *   renvoie un message générique afin de ne rien divulguer d'interne.
 *
 * @param error - Erreur capturée dans un bloc try/catch.
 * @returns Une réponse HTTP d'erreur normalisée.
 */
export function jsonError(error: unknown): Response {
  if (error instanceof AppError) {
    logger.warn('Erreur applicative', { code: error.code, message: error.message });
    return Response.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: corsHeaders },
    );
  }

  // Erreur non anticipée : le détail ne doit jamais transiter vers le client.
  logger.error('Erreur non gérée', { error });
  return Response.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' } },
    { status: 500, headers: corsHeaders },
  );
}

/**
 * Fabrique une réponse JSON de succès standardisée.
 *
 * @param data - Données métier à renvoyer au client.
 * @returns Une réponse HTTP 200 au format { success: true, data }.
 */
export function jsonSuccess(data: unknown): Response {
  return Response.json({ success: true, data }, { status: 200, headers: corsHeaders });
}