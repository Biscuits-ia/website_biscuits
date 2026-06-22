// src/lib/dateHelpers.ts
// Helpers date/temps parts par les routes RDV et les composants UI.
// Centralise les conversions pour viter la duplication toHHmm().

/**
 * Convertit un timestamp ISO en "HH:mm" en UTC.
 * Align sur le timestamptz stock en BDD (cf. appointment_slots.start_time).
 */
export function toHHmm(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Formate une plage horaire fr-FR : "HH:mm ? HH:mm".
 */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(startsAt).toLocaleTimeString('fr-FR', opts)} ? ${new Date(endsAt).toLocaleTimeString('fr-FR', opts)}`;
}

/**
 * Formate une date courte fr-FR : "1 janv. 2026".
 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Formate une date longue fr-FR : "jeudi 25 juin 2026".
 */
export function formatDateLong(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
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
