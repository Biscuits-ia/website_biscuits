// ============================================================================
// src/lib/helloasso.ts
// ----------------------------------------------------------------------------
// Client HelloAsso v5 (OAuth2 + API paiement + IPN).
// Documentation : https://dev.helloasso.com/
//
// Auth : OAuth2 Client Credentials (server-to-server).
//   - Pas d'interaction utilisateur
//   - On stocke un access_token (duree ~1h) et on le renouvelle a la volee
//   - Configurable par asso : https://admin.helloasso.com > Mon compte > API
//
// Ce module implemente :
//   - getAccessToken()       : recupere (et cache) un token valide
//   - createCheckoutIntent() : cree une intention de paiement (mode "cagnotte")
//   - getPaymentStatus()     : recupere le statut d'un paiement
//   - verifyWebhookSignature(): verifie la signature IPN
//
// Endpoints HelloAsso (sandbox par defaut) :
//   - API :  https://api.helloasso.com/v5
//   - OAuth: https://api.helloasso.com/oauth2/token
// ============================================================================

import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { createSupabaseAdminClient } from './supabase';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

export interface HelloAssoConfig {
  clientId:     string;
  clientSecret: string;
  /** true => utilise l'environnement sandbox, false => prod. */
  sandbox:      boolean;
  /** Slug de l'organisation HelloAsso (visible dans l'URL admin). */
  organizationSlug: string;
}

function loadConfig(): HelloAssoConfig | null {
  const clientId     = import.meta.env.HELLOASSO_CLIENT_ID;
  const clientSecret = import.meta.env.HELLOASSO_CLIENT_SECRET;
  const organizationSlug = import.meta.env.HELLOASSO_ORGANIZATION_SLUG;
  if (!clientId || !clientSecret || !organizationSlug) return null;
  const sandbox = import.meta.env.HELLOASSO_SANDBOX === 'true' || import.meta.env.HELLOASSO_SANDBOX === true;
  return { clientId: String(clientId), clientSecret: String(clientSecret), sandbox, organizationSlug: String(organizationSlug) };
}

function getApiBase(): string {
  // HelloAsso v5 a une seule URL d'API pour sandbox et prod.
  return 'https://api.helloasso.com/v5';
}

// --------------------------------------------------------------------------
// Token OAuth2 (Client Credentials) avec cache en BDD
// --------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  expiresAt:  number;  // ms epoch
}

let inMemoryToken: TokenCache | null = null;

/**
 * Recupere un access_token valide. Stratégie :
 *   1. Cache memoire du process (rapide)
 *   2. Cache en BDD (table helloasso_oauth_tokens) pour survival des lambdas
 *   3. Sinon, nouvel appel OAuth2
 */
export async function getAccessToken(): Promise<string> {
  const config = loadConfig();
  if (!config) throw new HelloAssoError('NOT_CONFIGURED', 'HelloAsso non configure (HELLOASSO_CLIENT_ID / SECRET / ORG_SLUG manquants).');

  // 1. Cache memoire
  if (inMemoryToken && inMemoryToken.expiresAt > Date.now() + 60_000) {
    return inMemoryToken.accessToken;
  }

  // 2. Cache BDD
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from('helloasso_oauth_tokens')
      .select('access_token, expires_at')
      .eq('client_id', config.clientId)
      .gt('expires_at', new Date(Date.now() + 60_000).toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      inMemoryToken = { accessToken: data.access_token, expiresAt: new Date(data.expires_at).getTime() };
      return inMemoryToken.accessToken;
    }
  } catch (err) {
    console.warn('[helloasso] DB token cache miss:', err);
  }

  // 3. Nouveau token
  return await refreshAccessToken(config);
}

async function refreshAccessToken(config: HelloAssoConfig): Promise<string> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(`${getApiBase()}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HelloAssoError('OAUTH_FAILED', `HelloAsso OAuth2 failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = Date.now() + data.expires_in * 1000;

  // Mise a jour des caches
  inMemoryToken = { accessToken: data.access_token, expiresAt };
  try {
    const admin = createSupabaseAdminClient();
    await admin.from('helloasso_oauth_tokens').upsert({
      client_id:      config.clientId,
      access_token:   data.access_token,
      expires_at:     new Date(expiresAt).toISOString(),
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'client_id' });
  } catch (err) {
    console.warn('[helloasso] failed to persist token to DB:', err);
  }

  return data.access_token;
}

// --------------------------------------------------------------------------
// Erreur specifique
// --------------------------------------------------------------------------

export class HelloAssoError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HelloAssoError';
  }
}

// --------------------------------------------------------------------------
// API : Paiements
// --------------------------------------------------------------------------

export interface CheckoutIntentInput {
  amountCents:       number;        // montant en centimes (min 100, max 1 000 000)
  registrationId:    string;        // ID de notre training_registration
  userEmail:         string;
  userName:          string;
  trainingTitle:     string;
  sessionDate:       string;        // texte formate
  successUrl:        string;
  errorUrl:          string;
  returnUrl:         string;
}

export interface CheckoutIntentResult {
  /** URL vers laquelle rediriger l'utilisateur pour payer. */
  redirectUrl: string;
  /** ID de l'intention cote HelloAsso. */
  intentId:    string;
}

/**
 * Cree une intention de paiement. Utilise l'endpoint "checkout-intents" de
 * HelloAsso v5. Le user sera redirige vers redirectUrl, paiera, puis reviendra
 * sur successUrl ou errorUrl. On peut verifier le statut final via webhook
 * (IPN) ou en interrogeant l'API.
 */
export async function createCheckoutIntent(input: CheckoutIntentInput): Promise<CheckoutIntentResult> {
  const config = loadConfig();
  if (!config) throw new HelloAssoError('NOT_CONFIGURED', 'HelloAsso non configure.');
  const token = await getAccessToken();

  const body = {
    totalAmount: input.amountCents,
    initialAmount: input.amountCents,
    itemName: `${input.trainingTitle} - ${input.sessionDate}`.slice(0, 250),
    backUrl: input.returnUrl,
    errorUrl: input.errorUrl,
    returnUrl: input.successUrl,
    containsDonation: false,
    payer: {
      firstName: input.userName.split(' ')[0] ?? input.userName,
      lastName:  input.userName.split(' ').slice(1).join(' ') || '-',
      email:     input.userEmail,
    },
    metadata: {
      registration_id: input.registrationId,
      training_slug:    input.trainingTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80),
    },
  };

  const res = await fetch(`${getApiBase()}/organizations/${config.organizationSlug}/checkout-intents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new HelloAssoError('CHECKOUT_FAILED', `HelloAsso checkout-intent failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { id: string; redirectUrl?: string; redirect_url?: string };
  const redirectUrl = data.redirectUrl ?? data.redirect_url ?? '';
  if (!redirectUrl) {
    throw new HelloAssoError('CHECKOUT_NO_URL', 'HelloAsso n\'a pas renvoye de redirectUrl.');
  }
  return { redirectUrl, intentId: data.id };
}

// --------------------------------------------------------------------------
// API : Verification du statut d'un paiement
// --------------------------------------------------------------------------

export interface PaymentStatus {
  id:               string;
  status:           'Pending' | 'Authorized' | 'Confirmed' | 'Refused' | 'Cancelled' | 'Refunded';
  amountCents:      number;
  paidAt:           string | null;
  payerEmail:       string | null;
}

/**
 * Recupere le statut d'un paiement (utile en complement du webhook, pour
 * verifier l'etat apres redirection du user).
 */
export async function getPaymentStatus(intentId: string): Promise<PaymentStatus> {
  const config = loadConfig();
  if (!config) throw new HelloAssoError('NOT_CONFIGURED', 'HelloAsso non configure.');
  const token = await getAccessToken();
  const res = await fetch(`${getApiBase()}/organizations/${config.organizationSlug}/checkout-intents/${intentId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HelloAssoError('STATUS_FAILED', `HelloAsso status failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    id:           data.id,
    status:       data.state ?? data.status ?? 'Pending',
    amountCents:  data.amount ?? data.totalAmount ?? 0,
    paidAt:       data.paidAt ?? data.paid_at ?? null,
    payerEmail:   data.payer?.email ?? null,
  };
}

// --------------------------------------------------------------------------
// Webhook (IPN HelloAsso)
// --------------------------------------------------------------------------

/**
 * Verifie la signature d'une requete IPN HelloAsso.
 * HelloAsso signe les webhooks avec HMAC-SHA256, header "X-HelloAsso-Signature".
 * Le payload est le body brut.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const config = loadConfig();
  if (!config) return false;

  // Format attendu : "sha256=<hex>" (on accepte aussi hex brut)
  const sig = signatureHeader.replace(/^sha256=/, '').trim();
  if (!/^[a-f0-9]{64}$/i.test(sig)) return false;

  const expected = createHmac('sha256', config.clientSecret).update(rawBody, 'utf-8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig.toLowerCase(), 'hex'), Buffer.from(expected.toLowerCase(), 'hex'));
  } catch {
    return false;
  }
}

/**
 * Hash deterministe d'un payload (pour deduplication en cas de retry du webhook).
 */
export function payloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf-8').digest('hex');
}
// --------------------------------------------------------------------------
// API : Remboursement (HelloAsso v5)
// --------------------------------------------------------------------------

/**
 * HelloAsso ne fournit pas d'endpoint REST documente pour creer un
 * remboursement. Les remboursements sont effectues cote dashboard HelloAsso
 * (admin) ou via le webhook IPN quand un utilisateur demande un refund
 * directement depuis HelloAsso.
 *
 * Cette fonction documente le flow et fournit un helper pour determiner
 * si un paiement a deja ete rembourse, en interrogeant l'API.
 *
 * Cote DB, on insere/upsert dans helloasso_refunds depuis :
 *   1. le webhook IPN (cas user-initiated)
 *   2. l'action manuelle admin (apres que l'admin ait fait le refund cote
 *      HelloAsso et nous ait fourni la preuve)
 */
export async function getPaymentRefunds(intentId: string): Promise<PaymentRefund[]> {
  const config = loadConfig();
  if (!config) throw new HelloAssoError('NOT_CONFIGURED', 'HelloAsso non configure.');
  const token = await getAccessToken();
  const res = await fetch(`${getApiBase()}/organizations/${config.organizationSlug}/checkout-intents/${intentId}/refunds`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HelloAssoError('REFUND_LIST_FAILED', `HelloAsso refund list failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  // La reponse contient un tableau de refunds (montant, date, etc.)
  return Array.isArray(data) ? data : (data?.data ?? []);
}

export interface PaymentRefund {
  id:                string;
  amount:            number;       // centimes
  state:             string;       // 'Refunded' | 'Pending'
  refundedAt:        string;
  reason?:           string;
  paymentId:         string;
}