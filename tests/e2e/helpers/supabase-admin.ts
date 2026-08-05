// tests/e2e/helpers/supabase-admin.ts — client service_role pour les tests E2E
//
// Pourquoi ce fichier :
// - Les tests du parcours authentifie ont besoin de fabriquer puis de detruire
//   leurs propres donnees (compte, sessions). Seule la cle service_role peut le
//   faire : les RLS reservent ces tables aux admins.
// - Le processus Playwright ne charge PAS `.env` (c'est Astro qui le fait, pour
//   le serveur de dev). On le lit donc ici, sans ajouter `dotenv` au projet
//   pour trois lignes.
//
// Ces helpers ne sont utilises que par les specs gardees derriere `E2E_AUTH`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Lit les fichiers d'environnement de la racine et renvoie leurs paires.
 *
 * Ordre repris de Vite / Astro : `.env` d'abord, `.env.local` ensuite et donc
 * prioritaire. C'est bien la que vivent les vraies valeurs de ce depot — `.env`
 * n'y porte que les cles, a valeur vide, et ne suffit pas.
 */
export function readEnvFile(): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const fichier of ['.env', '.env.local']) {
    let raw: string;
    try {
      raw = readFileSync(resolve(process.cwd(), fichier), 'utf-8');
    } catch {
      continue; // Fichier absent (CI, machine fraiche) : on passe au suivant.
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Retire les guillemets encadrants, simples ou doubles.
      if (value.length >= 2 && /^(".*"|'.*')$/s.test(value)) {
        value = value.slice(1, -1);
      }
      // Une valeur vide ne doit pas effacer celle d'un fichier precedent.
      if (value !== '') parsed[key] = value;
    }
  }

  // `process.env` gagne, mais seulement s'il porte une valeur NON VIDE. Ces
  // clés y figurent parfois définies à '' (shell, orchestrateur), et un écrasement
  // aveugle masquait alors la vraie valeur du fichier : le client se
  // construisait sans URL ni clé.
  const env = { ...parsed };
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value !== '') env[key] = value;
  }
  return env;
}

/** Client service_role. Leve si les cles manquent : un test qui croit nettoyer
 *  sans y parvenir laisse des donnees derriere lui, mieux vaut echouer fort. */
export function createAdminClient(): SupabaseClient {
  const env = readEnvFile();
  const url = env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[e2e] SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour les tests authentifiés.'
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
