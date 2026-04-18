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
  online: boolean;
  max_seats: number;
  is_published: boolean;
  price_cents: number | null;   // null = hérite de workshop
  price_label: string | null;
  workshop_registrations: WorkshopRegistrationCount[];
}

export interface Workshop {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  level: string | null;          // ex: "Débutant", "Intermédiaire", "Avancé"
  price_cents: number;           // prix par défaut en centimes (0 = gratuit)
  price_label: string | null;   // libellé affiché ex: "35 €", "Gratuit"
  is_free: boolean;
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
  online:               boolean;
  max_seats:            number;
  is_published:         boolean;
  seats_left:           number;
  // Colonnes jointes depuis la table `workshops`
  workshop_title:       string;
  workshop_description: string | null;
  workshop_category:    string | null;
  workshop_level:       string | null;
  // Prix résolu (session override OU valeur atelier)
  price_cents:          number;
  price_label:          string | null;
  is_free:              boolean;
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

/**
 * Formate un prix en centimes vers un libellé lisible.
 * Si price_label est fourni, il est prioritaire.
 * Sinon : 0 = "Gratuit", sinon "X,XX €".
 */
export function formatPrice(priceCents: number, priceLabel: string | null | undefined): string {
  if (priceLabel) return priceLabel;
  if (priceCents === 0) return 'Gratuit';
  return `${(priceCents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Récupère le premier champ texte d'un FormData (null si File) */
export function getFormString(form: FormData, key: string): string | null {
  const val = form.get(key);
  return val instanceof File ? null : val;
}