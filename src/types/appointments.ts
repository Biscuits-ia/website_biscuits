// src/types/appointments.ts
// Source de vérité = schéma BDD réel (tables appointment_slots, volunteer_appointments).
// Pas d'invention : tout champ listé ici doit exister dans la BDD.

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';

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
