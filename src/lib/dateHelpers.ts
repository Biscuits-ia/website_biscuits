// src/lib/dateHelpers.ts
// Helpers date/temps parts par les routes RDV et les composants UI.
// Centralise les conversions pour viter la duplication toHHmm().

/**
 * Fuseau de reference du site. L'association est francaise : toutes les heures
 * affichees et saisies sont des heures de Paris, quel que soit le fuseau du
 * navigateur. Ne PAS remplacer par l'heure locale du client : admin et user
 * verraient alors deux heures differentes pour le meme creneau.
 */
export const SITE_TZ = 'Europe/Paris';

/**
 * Decalage (ms) entre Europe/Paris et UTC a l'instant donne. Gere l'heure d'ete.
 */
export function siteTzOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return asUtc - date.getTime();
}

/**
 * Convertit un timestamp ISO en "HH:mm" a l'heure de Paris.
 */
export function toHHmm(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: SITE_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

/**
 * Cle jour calendaire "YYYY-MM-DD" a l'heure de Paris.
 * A utiliser partout ou l'on groupe des instants par jour : `toISOString()`
 * decale d'un jour pour tout instant entre minuit et 01h/02h locales.
 */
export function siteDateKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * Construit l'instant UTC correspondant a "YYYY-MM-DD" + "HH:mm" saisis en
 * heure de Paris. Double passe pour rester correct aux bascules d'heure d'ete.
 */
export function siteIsoFromDateAndTime(dateKey: string, hhmm: string): string {
  const naive = new Date(`${dateKey}T${hhmm}:00.000Z`);
  if (Number.isNaN(naive.getTime())) return '';
  let instant = new Date(naive.getTime() - siteTzOffsetMs(naive));
  const settled = siteTzOffsetMs(instant);
  if (settled !== siteTzOffsetMs(naive)) {
    instant = new Date(naive.getTime() - settled);
  }
  return instant.toISOString();
}

/**
 * Formate une plage horaire fr-FR : "HH:mm ? HH:mm".
 */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${toHHmm(startsAt)} - ${toHHmm(endsAt)}`;
}

/**
 * Formate une date courte fr-FR : "1 janv. 2026".
 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    timeZone: SITE_TZ, day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Formate une date longue fr-FR : "jeudi 25 juin 2026".
 */
export function formatDateLong(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    timeZone: SITE_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * Formate une date longue avec l'heure, en heure de Paris :
 * "jeudi 30 juillet 2026 a 14:00".
 * Utilise pour les sessions de recrutement (pages SSR + emails) : sans
 * `timeZone`, le rendu suit le fuseau du serveur (UTC sur Vercel) et affiche
 * une heure fausse de 1 a 2 h.
 */
export function formatDateTimeLong(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('fr-FR', {
    timeZone: SITE_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return `${date} a ${toHHmm(isoString)}`;
}

/**
 * Calcule l'tat temporel d'un slot par rapport  "maintenant".
 *  - past         : end_time < now  (termin)
 *  - in_progress  : start_time <= now <= end_time  (en cours)
 *  - upcoming     : now < start_time  ( venir)
 */
export type TemporalState = 'past' | 'in_progress' | 'upcoming';

export function getTemporalState(
  startIso: string,
  endIso: string,
  now: Date = new Date(),
): TemporalState {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 'upcoming';
  const nowMs = now.getTime();
  if (nowMs >= endMs) return 'past';
  if (nowMs >= startMs) return 'in_progress';
  return 'upcoming';
}
