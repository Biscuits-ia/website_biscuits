// src/types/ateliers.ts
// Types stricts partagés entre les pages et les API routes des ateliers

// ─── Supabase raw shapes ───────────────────────────────────────────────────────

export interface WorkshopRegistrationCount {
  count: number;
}

export interface WorkshopSession {
  id: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  max_seats: number;
  is_published: boolean;
  workshop_registrations: WorkshopRegistrationCount[];
}

export interface Workshop {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  created_at: string;
  workshop_sessions: WorkshopSession[];
}

// ─── Vue utilisateur ───────────────────────────────────────────────────────────
//
// Correspond à la vue Supabase `workshop_sessions_with_seats` qui joint
// les colonnes de la table `workshops` (préfixées `workshop_*`) à la session.

export interface WorkshopSessionWithSeats {
  id:                   string;
  starts_at:            string;
  ends_at:              string;
  location:             string | null;
  max_seats:            number;
  is_published:         boolean;
  seats_left:           number;
  // Colonnes jointes depuis la table `workshops`
  workshop_title:       string;
  workshop_description: string | null;
  workshop_category:    string | null;
}

export interface WorkshopWithSessions {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  workshop_sessions: WorkshopSessionWithSeats[];
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isWorkshop(value: unknown): value is Workshop {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id'               in value && typeof (value as Workshop).id === 'string' &&
    'title'            in value && typeof (value as Workshop).title === 'string' &&
    'workshop_sessions' in value && Array.isArray((value as Workshop).workshop_sessions)
  );
}

export function isWorkshopSession(value: unknown): value is WorkshopSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id'         in value && typeof (value as WorkshopSession).id === 'string' &&
    'starts_at'  in value && typeof (value as WorkshopSession).starts_at === 'string' &&
    'ends_at'    in value && typeof (value as WorkshopSession).ends_at === 'string' &&
    'max_seats'  in value && typeof (value as WorkshopSession).max_seats === 'number' &&
    'is_published' in value && typeof (value as WorkshopSession).is_published === 'boolean'
  );
}

export function isWorkshopSessionWithSeats(value: unknown): value is WorkshopSessionWithSeats {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id'         in value && typeof (value as WorkshopSessionWithSeats).id === 'string' &&
    'seats_left' in value && typeof (value as WorkshopSessionWithSeats).seats_left === 'number'
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrait le nombre d'inscrits depuis le shape Supabase `count` */
export function getRegistrationCount(session: WorkshopSession): number {
  const raw = session.workshop_registrations?.[0]?.count;
  return typeof raw === 'number' ? raw : 0;
}

/** Formate une plage horaire fr-FR */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(startsAt).toLocaleTimeString('fr-FR', opts)} → ${new Date(endsAt).toLocaleTimeString('fr-FR', opts)}`;
}

/** Formate une date courte fr-FR */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Formate une date longue fr-FR */
export function formatDateLong(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Récupère le premier champ texte d'un FormData (null si File) */
export function getFormString(form: FormData, key: string): string | null {
  const val = form.get(key);
  return val instanceof File ? null : val;
}