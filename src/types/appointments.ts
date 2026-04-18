export interface VolunteerAppointment {
  id: string;
  token: string;
  candidate_email: string | null;
  status: 'pending' | 'booked' | 'expired' | 'cancelled';
  selected_date: string | null; // ISO 8601 timestamp
  selected_timezone: string;
  created_at: string;
  expires_at: string;
  updated_at: string;
  admin_notes: string | null;
}

export interface CreateAppointmentInput {
  candidate_email?: string;
  admin_notes?: string;
}

export interface UpdateAppointmentInput {
  selected_date?: string;
  selected_timezone?: string;
  status?: string;
  admin_notes?: string;
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
