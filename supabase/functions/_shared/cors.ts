// ==============================================================================
// _shared/cors.ts — Gestion centralisée des en-têtes CORS pour les Edge Functions
// ------------------------------------------------------------------------------
// But : exposer des réponses HTTP acceptables par n'importe quel client frontend.
// En production, restreindre "Access-Control-Allow-Origin" à votre domaine.
// ==============================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Gère la requête de pré-vérification CORS (OPTIONS).
 *
 * @param req - La requête HTTP entrante.
 * @returns Une réponse HTTP pour les pré-vérifications, sinon null pour laisser
 *          le traitement normal se poursuivre.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}