// ============================================================================
// src/types/formations.ts
// ----------------------------------------------------------------------------
// Types stricts partages entre les pages, les composants et les routes API
// pour le systeme de formations payantes (modele tarif conscient + parrainage).
// Toutes les tables ici ont leur pendant en BDD dans supabase/migrations/
// 20260624_add_trainings.sql.
// ============================================================================

// --------------------------------------------------------------------------
// Formes brutes Supabase
// --------------------------------------------------------------------------

/** Table `trainings` (catalogue). */
export interface Training {
  id:                     string;
  slug:                   string;
  title:                  string;
  short_description:      string | null;
  description:            string | null;
  category:               string | null;
  level:                  string | null;
  duration_label:         string | null;
  is_paying:              boolean;
  min_price_cents:        number;
  suggested_price_cents:  number;
  solidarity_price_cents: number;
  is_published:           boolean;
  display_order:          number;
  cover_image_url:        string | null;
  created_at:             string;
  updated_at:             string;
}

/** Table `training_sessions` (sessions d'une formation). */
export interface TrainingSession {
  id:                      string;
  training_id:             string;
  starts_at:               string;
  ends_at:                 string;
  location:                string | null;
  online:                  boolean;
  max_seats:               number;
  is_published:            boolean;
  allow_sliding_scale:     boolean;
  allow_sponsorship:       boolean;
  allow_free_request:      boolean;
  helloasso_form_url:      string | null;
  bank_transfer_info:      string | null;
  override_min_cents:      number | null;
  override_suggested_cents: number | null;
  override_solidarity_cents: number | null;
  created_at:              string;
  updated_at:              string;
}

/** Table `training_registrations` (inscriptions). */
export interface TrainingRegistration {
  id:             string;
  session_id:     string;
  user_id:        string;
  amount_cents:   number;
  payment_method: TrainingPaymentMethod;
  status:         TrainingRegistrationStatus;
  sponsorship_id: string | null;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
}

/** Table `training_payments` (suivi comptable). */
export interface TrainingPayment {
  id:              string;
  registration_id: string;
  amount_cents:    number;
  currency:        string;
  provider:        TrainingPaymentProvider;
  provider_ref:    string | null;
  status:          TrainingPaymentStatus;
  received_at:     string | null;
  note:            string | null;
  created_at:      string;
  updated_at:      string;
}

/** Table `training_sponsorships` (parrainages). */
export interface TrainingSponsorship {
  id:                       string;
  sponsor_user_id:          string | null;
  sponsor_email:            string;
  sponsor_name:             string;
  amount_cents:             number;
  currency:                 string;
  message:                  string | null;
  mode:                     TrainingSponsorshipMode;
  beneficiary_email:        string | null;
  target_training_id:       string | null;
  target_session_id:        string | null;
  redemption_code:          string | null;
  is_redeemed:              boolean;
  redeemed_at:              string | null;
  redeemed_registration_id: string | null;
  payment_status:           TrainingPaymentStatus;
  payment_provider:         TrainingPaymentProvider | null;
  payment_ref:              string | null;
  created_at:               string;
  updated_at:               string;
}

/** Table `training_free_seat_requests` (demandes d'exoneration). */
export interface TrainingFreeSeatRequest {
  id:           string;
  session_id:   string;
  user_id:      string;
  reason:       string;
  status:       TrainingFreeRequestStatus;
  reviewed_by:  string | null;
  reviewed_at:  string | null;
  admin_note:   string | null;
  created_at:   string;
  updated_at:   string;
}

// --------------------------------------------------------------------------
// Enums (alignes sur les CHECK constraints SQL)
// --------------------------------------------------------------------------

export type TrainingPaymentMethod =
  | 'pending'
  | 'helloasso'
  | 'transfer'
  | 'sponsorship'
  | 'free_request'
  | 'free_approved';

export type TrainingRegistrationStatus =
  | 'pending_payment'
  | 'awaiting_sponsorship'
  | 'awaiting_validation'
  | 'confirmed'
  | 'cancelled'
  | 'attended'
  | 'no_show';

export type TrainingPaymentStatus =
  | 'pending'
  | 'received'
  | 'refunded'
  | 'failed'
  | 'cancelled';

export type TrainingPaymentProvider =
  | 'helloasso'
  | 'transfer'
  | 'sponsorship'
  | 'manual';

export type TrainingSponsorshipMode = 'pool' | 'nominative';

export type TrainingFreeRequestStatus = 'pending' | 'approved' | 'refused';

// --------------------------------------------------------------------------
// Vue utilisateur : training_sessions_with_seats
// --------------------------------------------------------------------------
// C'est l'equivalent de WorkshopSessionWithSeats, avec les colonnes
// de prix resolu (sliding scale : min / suggere / solidarite) et les
// compteurs d'occupation.

export interface TrainingSessionWithSeats {
  id:                          string;
  starts_at:                   string;
  ends_at:                     string;
  location:                    string | null;
  online:                      boolean;
  max_seats:                   number;
  is_published:                boolean;
  allow_sliding_scale:         boolean;
  allow_sponsorship:           boolean;
  allow_free_request:          boolean;
  helloasso_form_url:          string | null;
  bank_transfer_info:          string | null;
  seats_left:                  number;
  registered_count:            number;
  // Champs joints depuis la formation
  training_id:                 string;
  training_slug:               string;
  training_title:              string;
  training_short_description:  string | null;
  training_description:        string | null;
  training_category:           string | null;
  training_level:              string | null;
  training_duration_label:     string | null;
  training_cover_image_url:    string | null;
  training_is_paying:          boolean;
  // Prix resolu (override session ou valeur formation)
  min_price_cents:             number;
  suggested_price_cents:       number;
  solidarity_price_cents:      number;
}

// --------------------------------------------------------------------------
// Formes agregees pour les pages
// --------------------------------------------------------------------------

/** Inscription enrichie avec les infos de session + formation (pour dashboard). */
export interface TrainingRegistrationWithContext extends TrainingRegistration {
  session: TrainingSessionWithSeats;
  payment: TrainingPayment | null;
  sponsorship: TrainingSponsorship | null;
}

/** Ligne dashboard admin : une session, son nombre d'inscrits, le CA. */
export interface TrainingAdminSessionRow {
  session:           TrainingSessionWithSeats;
  seatsBadge:        string;     // classe CSS : badge-err | badge-warn | badge-ok
  seatsLabel:        string;     // texte affiche
  dateStr:           string;     // date formatee fr-FR
  timeRange:         string;     // "HH:MM -> HH:MM"
  registered:        number;
  paidCents:         number;     // CA recu (toutes methodes confondues, "received")
  paidCount:         number;     // nombre de paiements "received"
  freeCount:         number;     // exonerees / parrainees
  toggleVal:         string;     // String(!s.is_published) -- evite l'operateur ! dans le template
}

/** Resultat d'appel aux RPC securisees cote BDD. */
export type AtomicTrainingRegisterResult =
  | 'OK'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_FULL'
  | 'ALREADY_REGISTERED'
  | 'NOT_ALLOWED';

export type RedeemSponsorshipResult =
  | 'OK'
  | 'CODE_INVALID'
  | 'CODE_NOT_FOR_USER'
  | 'CODE_WRONG_SESSION'
  | 'ALREADY_REGISTERED';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Remplace les apostrophes typographiques pour eviter les soucis d'affichage. */
export function safeText(value: string | null | undefined, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.length > 0 ? value : fallback;
}

/** Formate un prix en centimes vers un libelle lisible fr-FR. */
export function formatPriceCents(cents: number, currency = 'EUR'): string {
  if (!Number.isFinite(cents) || cents <= 0) return 'Gratuit';
  const value = (cents / 100).toFixed(2).replace('.', ',');
  return currency === 'EUR' ? `${value} EUR` : `${value} ${currency}`;
}

/**
 * Renvoie la fourchette de prix affichee : "Min 80 EUR  /  Suggere 200 EUR  /  Solidarite 350 EUR".
 * Gere le cas formation 100 % gratuite.
 */
export function formatSlidingScale(
  min: number,
  suggested: number,
  solidarity: number,
  currency = 'EUR',
): string {
  if (min === 0 && suggested === 0 && solidarity === 0) return 'Gratuit';
  const fmt = (n: number) => formatPriceCents(n, currency);
  return `Min ${fmt(min)}  /  Suggere ${fmt(suggested)}  /  Solidarite ${fmt(solidarity)}`;
}

/** Formate une plage horaire fr-FR. */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(startsAt).toLocaleTimeString('fr-FR', opts)} -> ${new Date(endsAt).toLocaleTimeString('fr-FR', opts)}`;
}

/** Formate une date courte fr-FR. */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Formate une date longue fr-FR. */
export function isFreeTraining(min: number, suggested: number, solidarity: number): boolean {
  return min === 0 && suggested === 0 && solidarity === 0;
}

export function formatDateLong(isoString: string): string {
  return new Date(isoString).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Recupere le premier champ texte d'un FormData (null si File). */
export function getFormString(form: FormData, key: string): string | null {
  const val = form.get(key);
  return val instanceof File ? null : val;
}

/** Genere un slug URL-safe a partir d'un titre. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // retire les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/** Genere un code de redemption a 8 chars (A-Z 0-9, sans I/O/0/1 pour eviter confusion). */
export function generateRedemptionCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}