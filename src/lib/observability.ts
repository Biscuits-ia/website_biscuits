// src/lib/observability.ts
//
// Observabilite — Vercel natif, ZERO dependance tierce (audit.md P2 #20).
//
// Choix delibere : pas de Sentry ni d'autre SaaS. Une association qui promeut
// l'« IA ethique » et publie une charte ne doit pas exfiltrer les erreurs (qui
// peuvent contenir des donnees personnelles : emails, ids, payloads) vers un
// tiers sans base legale claire.
//
// Sur Vercel, tout ce qui est ecrit sur stdout/stderr par une Function est
// capture dans les Runtime Logs (et l'onglet Observability du dashboard).
// Il suffit donc d'emettre une ligne JSON structuree : elle devient requetable
// et filtrable dans l'UI Vercel, sans agent ni SDK.
//
// Convention : une ligne = un evenement JSON sur une seule ligne (ndjson),
// ce que les backends de logs (dont Vercel) savent parser.

type LogLevel = 'error' | 'warn' | 'info';

/** Contexte de requete minimal, sans donnee sensible (ni cookies, ni body). */
export interface RequestContext {
  method?: string;
  path?: string;
  /** Identifiant de correlation si disponible (ex. header x-vercel-id). */
  requestId?: string | null;
}

interface LogRecord extends RequestContext {
  level: LogLevel;
  ts: string;
  msg: string;
  err?: { name: string; message: string; stack?: string };
}

/** Normalise une valeur inconnue attrapee dans un catch en objet d'erreur serialisable. */
function toErrorShape(error: unknown): LogRecord['err'] {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'NonError', message: typeof error === 'string' ? error : JSON.stringify(error) };
}

function emit(record: LogRecord): void {
  const line = JSON.stringify(record);
  // stderr pour les erreurs (surface distincte dans Vercel), stdout sinon.
  if (record.level === 'error') console.error(line);
  else if (record.level === 'warn') console.warn(line);
  else console.info(line);
}

/**
 * Journalise une erreur non geree avec son contexte de requete.
 * Destinee aux catch de dernier recours (middleware, handlers critiques).
 */
export function logError(msg: string, error: unknown, ctx: RequestContext = {}): void {
  emit({ level: 'error', ts: new Date().toISOString(), msg, err: toErrorShape(error), ...ctx });
}

/** Journalise un avertissement structure (degradation non bloquante). */
export function logWarn(msg: string, ctx: RequestContext = {}): void {
  emit({ level: 'warn', ts: new Date().toISOString(), msg, ...ctx });
}

/**
 * Extrait un contexte de requete non sensible d'une Request.
 * N'inclut JAMAIS cookies, Authorization ni corps de requete.
 */
export function requestContext(request: Request): RequestContext {
  const url = (() => {
    try {
      return new URL(request.url).pathname;
    } catch {
      return undefined;
    }
  })();
  return {
    method: request.method,
    path: url,
    requestId: request.headers.get('x-vercel-id'),
  };
}
