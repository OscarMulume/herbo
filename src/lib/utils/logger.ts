// ==============================================================================
// lib/utils/logger.ts — Journalisation légère côté client (browser)
// ------------------------------------------------------------------------------
// But : tracer les événements importants sans encombrer la console en prod.
// Le niveau est piloté par NEXT_PUBLIC_LOG_LEVEL (filtrage par défaut : info).
// ==============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: LogLevel =
  (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || 'info';

/**
 * Journalise une entrée estampillée si le niveau configuré le permet.
 *
 * @param level   - Niveau de gravité.
 * @param message - Message lisible.
 * @param context - Contexte objet optionnel (attention à ne pas logger de secrets).
 */
function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[client:${level}] ${message}`, context ?? '');
}

/** API ergonomique du logger client. */
export const clientLogger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};