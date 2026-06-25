// ============================================================================
// src/lib/formations.ts
// ----------------------------------------------------------------------------
// Helpers metiers pour le systeme de formations payantes.
// - Schemas Zod partages pour les routes API et l''admin
// - Calculs de prix (sliding scale, validation montant)
// - Generation de codes de redemption uniques
// - Generation de slugs
// ============================================================================

import { z } from 'zod';
import {
  generateRedemptionCode as generateCode,
  slugify as slugifyBase,
} from '@/types/formations';
import { isValidUUID } from './validation';
import type { SupabaseClient } from '@supabase/supabase-js';

// --------------------------------------------------------------------------
// Constantes metier
// --------------------------------------------------------------------------

/** Borne haute absolue pour eviter les abus (10 000 EUR). */
export const MAX_PRICE_CENTS = 1_000_000;

/** Longueur min/max d''un slug de formation. */
export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 80;

/** Longueurs pour la motivation d''une demande d''exoneration. */
export const MIN_FREE_REASON_LENGTH = 50;
export const MAX_FREE_REASON_LENGTH = 500;

/** Longueurs pour un message de parrainage. */
export const MAX_SPONSOR_MESSAGE_LENGTH = 300;

// --------------------------------------------------------------------------
// Schemas Zod
// --------------------------------------------------------------------------

/** Schema commun : un entier >= 0 et <= MAX_PRICE_CENTS. */
export const priceCentsSchema = z.coerce
  .number()
  .int('Le montant doit etre un nombre entier (en centimes).')
  .min(0, 'Le montant ne peut pas etre negatif.')
  .max(MAX_PRICE_CENTS, `Le montant ne peut pas depasser ${MAX_PRICE_CENTS / 100} EUR.`);

/** Slug URL-safe. */
export const slugSchema = z
  .string()
  .min(MIN_SLUG_LENGTH, `Le slug doit faire au moins ${MIN_SLUG_LENGTH} caracteres.`)
  .max(MAX_SLUG_LENGTH, `Le slug ne peut pas depasser ${MAX_SLUG_LENGTH} caracteres.`)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide : lettres minuscules, chiffres et tirets uniquement.');

/** Texte libre requis, longueur bornee. */
export const requiredText = (min: number, max: number, field: string) =>
  z
    .string()
    .trim()
    .min(min, `${field} : au moins ${min} caracteres.`)
    .max(max, `${field} : ${max} caracteres maximum.`);

/** Texte libre optionnel. */
export const optionalText = (max: number, field: string) =>
  z
    .string()
    .trim()
    .max(max, `${field} : ${max} caracteres maximum.`)
    .optional()
    .or(z.literal('').transform(() => undefined));

/** Email. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email invalide.');

/** UUID. */
export const uuidSchema = z.string().refine(isValidUUID, 'Identifiant invalide.');

/** Methode de paiement (sous-ensemble pour une inscription). */
export const paymentMethodSchema = z.enum([
  'helloasso',
  'transfer',
  'sponsorship',
  'free_request',
]);

/** Mode de parrainage. */
export const sponsorshipModeSchema = z.enum(['pool', 'nominative']);

// --------------------------------------------------------------------------
// Schemas composes
// --------------------------------------------------------------------------

/** Formulaire de creation / modification d''une formation (admin). */
export const trainingUpsertSchema = z.object({
  title:                  requiredText(3, 150, 'Le titre'),
  short_description:      optionalText(280, 'La description courte'),
  description:            optionalText(5000, 'La description'),
  category:               optionalText(80, 'La categorie'),
  level:                  optionalText(80, 'Le niveau'),
  duration_label:         optionalText(80, 'La duree'),
  is_paying:              z.coerce.boolean().optional().default(true),
  min_price_cents:        priceCentsSchema,
  suggested_price_cents:  priceCentsSchema,
  solidarity_price_cents: priceCentsSchema,
  is_published:           z.coerce.boolean().optional().default(false),
  display_order:          z.coerce.number().int().min(0).max(10000).optional().default(0),
  cover_image_url:        optionalText(500, 'L\'URL de l\'image de couverture'),
}).refine(
  (data) => data.min_price_cents <= data.suggested_price_cents,
  { message: 'Le prix minimum ne peut pas depasser le prix suggere.', path: ['min_price_cents'] },
).refine(
  (data) => data.suggested_price_cents <= data.solidarity_price_cents,
  { message: 'Le prix suggere ne peut pas depasser le prix de solidarite.', path: ['suggested_price_cents'] },
);

/** Formulaire d''inscription a une session (utilisateur). */
export const trainingRegistrationSchema = z.object({
  session_id:     uuidSchema,
  amount_cents:   priceCentsSchema,
  payment_method: paymentMethodSchema,
  notes:          optionalText(500, 'Les notes'),
});

/** Formulaire de creation / modification d''une session (admin). */
export const trainingSessionUpsertSchema = z.object({
  training_id:             uuidSchema,
  starts_at:               z.string().min(1, 'Date de debut requise.'),
  ends_at:                 z.string().min(1, 'Date de fin requise.'),
  location:                optionalText(200, 'Le lieu'),
  online:                  z.coerce.boolean().optional().default(false),
  max_seats:               z.coerce.number().int().min(1).max(200).default(12),
  is_published:            z.coerce.boolean().optional().default(false),
  allow_sliding_scale:     z.coerce.boolean().optional().default(true),
  allow_sponsorship:       z.coerce.boolean().optional().default(true),
  allow_free_request:      z.coerce.boolean().optional().default(true),
  helloasso_form_url:      optionalText(500, 'L\'URL HelloAsso'),
  bank_transfer_info:      optionalText(2000, 'Les infos virement'),
  override_min_cents:      priceCentsSchema.optional(),
  override_suggested_cents: priceCentsSchema.optional(),
  override_solidarity_cents: priceCentsSchema.optional(),
});

/** Formulaire de demande d''exoneration. */
export const freeSeatRequestSchema = z.object({
  session_id: uuidSchema,
  reason:     requiredText(MIN_FREE_REASON_LENGTH, MAX_FREE_REASON_LENGTH, 'La motivation'),
});

/** Formulaire de parrainage (anonyme ou connecte). */
export const sponsorshipCreateSchema = z.object({
  training_id:       uuidSchema.optional(),
  session_id:        uuidSchema.optional(),
  mode:              sponsorshipModeSchema.default('pool'),
  sponsor_email:     emailSchema,
  sponsor_name:      requiredText(2, 120, 'Votre nom'),
  amount_cents:      priceCentsSchema.refine((n) => n > 0, 'Le montant doit etre strictement positif.'),
  message:           optionalText(MAX_SPONSOR_MESSAGE_LENGTH, 'Le message'),
  beneficiary_email: emailSchema.optional(),
}).refine(
  (data) => data.mode !== 'nominative' || !!data.beneficiary_email,
  { message: 'Email du beneficiaire requis pour un parrainage nominatif.', path: ['beneficiary_email'] },
);

/** Validation d''un code de redemption a la consommation. */
export const redemptionCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6,12}$/, 'Code de redemption invalide.');

// --------------------------------------------------------------------------
// Calculs de prix
// --------------------------------------------------------------------------

/** Borne un montant choisi par l''utilisateur dans la fourchette min..solidarity. */
export function clampSlidingScale(
  amount: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(amount) || amount < 0) return min;
  if (amount < min) return min;
  if (amount > max) return max;
  return Math.floor(amount);
}

/** Renvoie true si une formation est entierement gratuite. */
export function isFreeTraining(min: number, suggested: number, solidarity: number): boolean {
  return min === 0 && suggested === 0 && solidarity === 0;
}

// --------------------------------------------------------------------------
// Helpers slug / code
// --------------------------------------------------------------------------

/** Genere un slug a partir du titre ; garanti unique cote BDD. */
export async function generateUniqueSlug(
  supabase: SupabaseClient,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyBase(title);
  if (base.length < MIN_SLUG_LENGTH) {
    throw new Error('Titre insuffisant pour generer un slug.');
  }
  let candidate = base;
  let n = 1;
  // Boucle avec garde-fou : max 50 tentatives
  for (let i = 0; i < 50; i++) {
    const query = supabase
      .from('trainings')
      .select('id')
      .eq('slug', candidate)
      .limit(1);
    const { data } = excludeId
      ? await query.neq('id', excludeId)
      : await query;
    if (!data || data.length === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  throw new Error('Impossible de generer un slug unique apres 50 tentatives.');
}

/** Genere un code de redemption non collide cote BDD. */
export async function generateUniqueRedemptionCode(
  supabase: SupabaseClient,
  length = 8,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateCode(length);
    const { data } = await supabase
      .from('training_sponsorships')
      .select('id')
      .eq('redemption_code', code)
      .limit(1);
    if (!data || data.length === 0) return code;
  }
  throw new Error('Impossible de generer un code de redemption unique.');
}