import { randomBytes } from 'crypto';

/**
 * Helper utilities pour le système de rendez-vous
 */

export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

export function formatAppointmentDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getTimeUntilExpiry(expiresAt: string): {
  expired: boolean;
  text: string;
  hours: number;
  minutes: number;
} {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff < 0) {
    return {
      expired: true,
      text: 'Expiré',
      hours: 0,
      minutes: 0,
    };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return {
    expired: false,
    text: `${hours}h ${minutes}m`,
    hours,
    minutes,
  };
}

export function isValidToken(token: string): boolean {
  // Token doit être un hex string de 64 caractères (32 bytes)
  return /^[a-f0-9]{64}$/.test(token);
}

export function buildAppointmentURL(token: string, baseURL: string = ''): string {
  const url = baseURL || typeof window !== 'undefined' ? window.location.origin : 'https://example.com';
  return `${url}/rdv/${token}`;
}

export function isDateInPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

export function isDateInPastThreshold(dateStr: string, thresholdMinutes: number = 30): boolean {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = date.getTime() - now.getTime();
  return diff < thresholdMinutes * 60 * 1000;
}

export function getAvailableDatesArray(daysCount: number = 30): string[] {
  const today = new Date();
  const dates: string[] = [];

  for (let i = 0; i < daysCount; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }

  return dates;
}

export interface TimeSlotConfig {
  startHour: number;
  endHour: number;
  intervalMinutes: number;
}

export const DEFAULT_SLOT_CONFIG: TimeSlotConfig = {
  startHour: 9,
  endHour: 18,
  intervalMinutes: 30,
};

export function generateTimeSlots(config: TimeSlotConfig = DEFAULT_SLOT_CONFIG): string[] {
  const slots: string[] = [];
  const { startHour, endHour, intervalMinutes } = config;

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += intervalMinutes) {
      slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }

  return slots;
}

/**
 * Construire un objet de date/heure ISO
 */
export function buildISODateTime(date: string, time: string, timezone: string = 'Europe/Paris'): string {
  const [hours, minutes] = time.split(':').map(Number);
  const dateObj = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
  return dateObj.toISOString();
}

/**
 * Status colors pour l'admin dashboard
 */
export const STATUS_COLORS = {
  pending: { bg: '#fff3cd', text: '#856404', label: 'En attente' },
  booked: { bg: '#d4edda', text: '#155724', label: 'Réservé' },
  expired: { bg: '#f8d7da', text: '#721c24', label: 'Expiré' },
  cancelled: { bg: '#e2e3e5', text: '#383d41', label: 'Annulé' },
};

export function getStatusColor(status: string): (typeof STATUS_COLORS)[keyof typeof STATUS_COLORS] {
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.pending;
}

/**
 * Vérification rapide d'un rendez-vous
 */
export interface AppointmentCheckResult {
  valid: boolean;
  reason?: string;
  canBook: boolean;
}

export function checkAppointmentValidity(appointment: {
  status: string;
  expires_at: string;
}): AppointmentCheckResult {
  // Vérifier le statut
  if (appointment.status !== 'pending') {
    return {
      valid: false,
      reason: `Ce rendez-vous a le statut "${appointment.status}"`,
      canBook: false,
    };
  }

  // Vérifier l'expiration
  if (new Date() > new Date(appointment.expires_at)) {
    return {
      valid: false,
      reason: 'Ce lien a expiré',
      canBook: false,
    };
  }

  return {
    valid: true,
    canBook: true,
  };
}
