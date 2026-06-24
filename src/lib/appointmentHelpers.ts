// src/lib/appointmentHelpers.ts
// Helpers UI pour les composants RDV. Source de vrit = schema BDD
// (cf. src/types/appointments.ts).

import type { AppointmentSlot } from '@/types/appointments';
import { formatDateLong, toHHmm, type TemporalState } from '@/lib/dateHelpers';

/** Formate un slot en "HH:mm - HH:mm" (UTC, align sur le timestamptz BDD). */
export function formatSlotTime(slot: Pick<AppointmentSlot, 'start_time' | 'end_time'>): string {
  return `${toHHmm(slot.start_time)} - ${toHHmm(slot.end_time)}`;
}

/** Formate un slot en "Jeudi 25 juin 2026" en UTC. */
export function formatSlotDateFr(slot: Pick<AppointmentSlot, 'start_time'>): string {
  return formatDateLong(slot.start_time);
}

export type { TemporalState };
