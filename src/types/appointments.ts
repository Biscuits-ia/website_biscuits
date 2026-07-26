// src/types/appointments.ts
// Source de vérité = schéma BDD réel (tables appointment_slots, volunteer_appointments).
// Pas d'invention : tout champ listé ici doit exister dans la BDD.

// 'expired' est pose par le job pg_cron `expire_pending_appointments`
// (migration 20260623100000) sur les RDV pending dont expires_at est depasse.
// Il fait partie du CHECK constraint en BDD : toute UI doit savoir l'afficher.
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

/** Statuts qui bloquent le creneau (un seul RDV actif par slot). */
export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ['pending', 'confirmed'];

export interface AppointmentSlot {
  id: string;
  start_time: string; // ISO 8601 timestamptz
  end_time: string; // ISO 8601 timestamptz
  title: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface VolunteerAppointment {
  id: string;
  slot_id: string | null;
  user_id: string | null;
  candidate_email: string | null;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relations jointes (optionnelles selon la requête)
  appointment_slots?: AppointmentSlot | null;
  user_profile?: { full_name: string | null; email: string | null } | null;
}

export interface CreateAppointmentInput {
  slot_id: string;
  notes?: string;
}

export interface UpdateAppointmentInput {
  status?: AppointmentStatus;
  notes?: string;
}

export interface AvailableSlot {
  time: string; // HH:mm format
  available: boolean;
}

export interface AvailableSlotsResponse {
  date: string; // YYYY-MM-DD
  timezone: string;
  slots: AvailableSlot[];
  available_count: number;
}
