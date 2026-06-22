// src/lib/appointmentHelpers.ts
// Helpers UI pour les composants RDV. Source de vérité = schéma BDD
// (cf. src/types/appointments.ts).

import type { AppointmentSlot } from '@/types/appointments';

/** Formate un slot en "HH:mm - HH:mm" (UTC, aligné sur le timestamptz BDD). */
export function formatSlotTime(slot: Pick<AppointmentSlot, 'start_time' | 'end_time'>): string {
  return `${toHHmm(slot.start_time)} - ${toHHmm(slot.end_time)}`;
}

/** Formate un slot en "Jeudi 25 juin 2026" en UTC. */
export function formatSlotDateFr(slot: Pick<AppointmentSlot, 'start_time'>): string {
  return new Date(slot.start_time).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export type TemporalState = 'past' | 'in_progress' | 'upcoming';

/**
 * Détermine l'état temporel d'un slot par rapport à "maintenant".
 *   - past         : end_time < now  (terminé)
 *   - in_progress  : start_time <= now <= end_time  (en cours)
 *   - upcoming     : now < start_time  (à venir)
 */
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

function toHHmm(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
