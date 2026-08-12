// ==============================================================================
// _shared/logger.ts — Journalisation structurée (JSON) pour les Edge Functions
// ------------------------------------------------------------------------------
// But : produire des logs exploitables par Supabase Logs / des outils externes,
// sans polluer la sortie console du runtime.
// Tolérant à l'exécution hors Deno (tests Vitest en Node) : on détecte la
// présence de l'objet global `Deno` avant de le lire.
// ==============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: LogLevel = resolveEnv('LOG_LEVEL') === 'debug' ? 'debug'
  : resolveEnv('LOG_LEVEL') === 'warn' ? 'warn'
  : resolveEnv('LOG_LEVEL') === 'error' ? 'error'
  : 'info';

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Lit une variable d'environnement de manière sûre selon l'environnement
 * (Deno pour les Edge Functions, process.env pour Node/tests).
 *
 * @param name - Nom de la variable.
 * @returns La valeur, ou undefined si absente.
 */
function resolveEnv(name: string): string | undefined {
  if (typeof Deno !== 'undefined') {
    return Deno.env.get(name);
  }
  return process.env?.[name];
}

/**
 * Écrit une entrée de journal structurée (une seule ligne JSON).
 *
 * @param level   - Niveau de gravité (debug, info, warn, error).
 * @param message - Message humain décrivant l'événement.
 * @param context - Contexte additionnel (identifiant, montant, erreur).
 */
export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    function: resolveEnv('FUNCTION_NAME') ?? 'unknown',
    ...context,
  };

  // Les erreurs vont sur stderr (aisées à filtrer), le reste sur stdout.
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// API ergonomique.
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};