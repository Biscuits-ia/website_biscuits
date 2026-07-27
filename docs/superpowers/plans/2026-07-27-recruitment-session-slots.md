# Créneaux horaires multiples sur les sessions de recrutement — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** permettre à un admin de définir plusieurs créneaux horaires (début et fin) sur une même session de recrutement, et à un candidat d'en choisir un seul.

**Architecture :** une table `recruitment_session_slots` porte horaires, lieu et capacité ; `recruitment_sessions` ne garde que l'identité de la campagne ; `recruitment_submissions.session_id` est remplacé par `slot_id`. La capacité est garantie en base par un trigger monté sur `slot_id`, et création/édition passent par deux fonctions Postgres pour rester atomiques.

**Tech Stack :** Astro 7 (`output: 'server'`, adaptateur Vercel), React 19 pour l'îlot de formulaire, Supabase/PostgreSQL, Playwright pour l'e2e.

**Spec de référence :** `docs/superpowers/specs/2026-07-27-recruitment-session-slots-design.md`

## Global Constraints

- Toute saisie d'horaire est interprétée comme une **heure de Paris** (`Europe/Paris`), jamais comme le fuseau du navigateur. Côté client, utiliser `parisIsoFromLocalInput` ; côté affichage, `formatDateTimeLong` / `toHHmm` de `src/lib/dateHelpers.ts`.
- **Aucune route publique n'utilise `select('*')`** sur les tables de recrutement : les colonnes exposées sont listées explicitement.
- Le **comptage des candidatures passe par le client service_role** (`createSupabaseAdminClient`). La policy `recruitment_admin_select` réserve la lecture de `recruitment_submissions` aux admins : un comptage fait avec la clé visiteur renvoie zéro sans erreur.
- Les policies RLS résolvent le rôle via **`public.get_my_role()`**, jamais par une sous-requête sur `profiles`. Aucune policy `FOR ALL` sur une table lue publiquement.
- Les **fonctions RPC d'écriture sont réservées à `service_role`** (`REVOKE` sur `PUBLIC`, `anon`, `authenticated`). L'autorisation métier reste le fait de `requireAdmin()` dans les routes API, comme partout ailleurs dans ce dépôt.
- Ordre des migrations : `20260727150000_fix_recruitment_sessions_public_read.sql` **doit être appliquée avant** celles de ce plan.
- **Aucune refonte visuelle.** On ne touche qu'aux champs et colonnes qu'impose le nouveau modèle, dans les composants et styles existants.
- Les messages d'erreur destinés à l'utilisateur sont en français.

## Prérequis

Ce plan suppose deux points réglés en amont, hors de son périmètre :

1. `supabase db push` a appliqué `20260727150000_fix_recruitment_sessions_public_read.sql`.
2. Le HTTP 500 de `/rejoignez-nous` en production est diagnostiqué. Ce plan modifie cette page ; déployer par-dessus un crash non expliqué empêcherait de savoir ce qui a corrigé quoi.

---

### Task 1 : Schéma des créneaux et trigger de capacité

**Files:**
- Create: `supabase/migrations/20260727160000_recruitment_session_slots.sql`
- Create: `scripts/verify-recruitment-slots.mjs`
- Modify: `package.json` (ajout du script `verify:slots`)

**Interfaces:**
- Consumes : `public.set_updated_at()` et `public.get_my_role()`, définies par les migrations existantes.
- Produces : table `public.recruitment_session_slots` (`id`, `session_id`, `starts_at`, `ends_at`, `location`, `max_candidates`, `created_at`, `updated_at`) ; colonne `public.recruitment_submissions.slot_id` ; fonction `public.check_recruitment_slot_capacity()`.

- [ ] **Step 1 : Écrire le script de vérification (il doit échouer)**

Créer `scripts/verify-recruitment-slots.mjs` :

```js
// Vérification du schéma des créneaux de recrutement.
// Usage : npm run verify:slots
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = env.SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label} ${detail}`); failures++; }
}

// 1. La table existe et expose les colonnes attendues.
const slots = await admin
  .from('recruitment_session_slots')
  .select('id, session_id, starts_at, ends_at, location, max_candidates, created_at, updated_at')
  .limit(1);
check('table recruitment_session_slots lisible', !slots.error, slots.error?.message ?? '');

// 2. Les anciennes colonnes ont disparu.
const legacySession = await admin.from('recruitment_sessions').select('scheduled_at').limit(1);
check('recruitment_sessions.scheduled_at supprimee', Boolean(legacySession.error));
const legacySub = await admin.from('recruitment_submissions').select('session_id').limit(1);
check('recruitment_submissions.session_id supprimee', Boolean(legacySub.error));

// 3. La colonne slot_id existe.
const slotId = await admin.from('recruitment_submissions').select('slot_id').limit(1);
check('recruitment_submissions.slot_id presente', !slotId.error, slotId.error?.message ?? '');

// 4. Chaque session a au moins un creneau (reprise des donnees).
const sessions = await admin.from('recruitment_sessions').select('id');
const allSlots = await admin.from('recruitment_session_slots').select('session_id');
const withSlot = new Set((allSlots.data ?? []).map((s) => s.session_id));
check(
  'chaque session existante a au moins un creneau',
  (sessions.data ?? []).every((s) => withSlot.has(s.id)),
);

// 5. La cle anon lit les creneaux des sessions ouvertes sans erreur de permission.
const anonRead = await anon.from('recruitment_session_slots').select('id, starts_at').limit(1);
check('lecture anon des creneaux', !anonRead.error, anonRead.error?.message ?? '');

console.log(failures === 0 ? '\nTOUT PASSE' : `\n${failures} VERIFICATION(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
```

Ajouter dans `package.json`, section `scripts` :

```json
"verify:slots": "node scripts/verify-recruitment-slots.mjs"
```

- [ ] **Step 2 : Lancer la vérification pour confirmer l'échec**

Run: `npm run verify:slots`
Expected: FAIL — `table recruitment_session_slots lisible` échoue avec un message du type `Could not find the table 'public.recruitment_session_slots' in the schema cache`.

- [ ] **Step 3 : Écrire la migration**

Créer `supabase/migrations/20260727160000_recruitment_session_slots.sql` :

```sql
-- =============================================================================
-- Migration : creneaux horaires multiples par session de recrutement
-- Date : 2026-07-27
-- =============================================================================
-- Une session ne decrivait qu'un instant (scheduled_at) et une duree. Les
-- horaires, le lieu et la capacite descendent dans une table de creneaux ; la
-- candidature pointe desormais sur un creneau et non plus sur une session.
--
-- Ordre : table -> colonne liee -> reprise des donnees -> trigger -> RLS ->
--         grants -> suppression des anciennes colonnes.
-- =============================================================================

-- ── 1. Table des creneaux ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recruitment_session_slots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES public.recruitment_sessions(id) ON DELETE CASCADE,
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  location       text,
  max_candidates integer     NOT NULL DEFAULT 10 CHECK (max_candidates > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_session_slots_order CHECK (ends_at > starts_at)
);

COMMENT ON TABLE  public.recruitment_session_slots                IS 'Creneaux horaires proposes par une session de recrutement. Le candidat en choisit un seul.';
COMMENT ON COLUMN public.recruitment_session_slots.max_candidates IS 'Places du creneau. Il n''y a pas de plafond au niveau de la session.';

DROP TRIGGER IF EXISTS trg_recruitment_session_slots_updated_at ON public.recruitment_session_slots;
CREATE TRIGGER trg_recruitment_session_slots_updated_at
  BEFORE UPDATE ON public.recruitment_session_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_recruitment_session_slots_session
  ON public.recruitment_session_slots (session_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_session_slots_starts
  ON public.recruitment_session_slots (starts_at);

-- ── 2. Lien candidature -> creneau ───────────────────────────────────────────
ALTER TABLE public.recruitment_submissions
  ADD COLUMN IF NOT EXISTS slot_id uuid REFERENCES public.recruitment_session_slots(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.recruitment_submissions.slot_id IS 'Creneau auquel le candidat est affecte. NULL = candidature spontanee.';

CREATE INDEX IF NOT EXISTS idx_recruitment_submissions_slot_status
  ON public.recruitment_submissions (slot_id, status);

-- ── 3. Reprise des donnees existantes ────────────────────────────────────────
-- Une session existante = un creneau, aux memes horaires. La correspondance
-- session -> creneau est donc unique, ce qui rend la jointure ci-dessous sure.
INSERT INTO public.recruitment_session_slots (session_id, starts_at, ends_at, location, max_candidates)
SELECT id,
       scheduled_at,
       scheduled_at + make_interval(mins => duration_minutes),
       location,
       max_candidates
FROM public.recruitment_sessions;

UPDATE public.recruitment_submissions sub
SET slot_id = sl.id
FROM public.recruitment_session_slots sl
WHERE sl.session_id = sub.session_id
  AND sub.session_id IS NOT NULL;

-- ── 4. Trigger de capacite, monte sur le creneau ─────────────────────────────
-- ATTENTION : la clause `OF slot_id` est critique. Laissee sur `session_id`,
-- colonne supprimee plus bas, le trigger cesserait de se declencher SANS
-- erreur -- le plafond deviendrait decoratif.
DROP TRIGGER IF EXISTS trg_recruitment_submissions_capacity ON public.recruitment_submissions;
DROP FUNCTION IF EXISTS public.check_recruitment_session_capacity();

CREATE OR REPLACE FUNCTION public.check_recruitment_slot_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max            integer;
  v_session_status text;
  v_count          integer;
BEGIN
  -- Desaffectation : rien a verifier.
  IF NEW.slot_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Affectation inchangee : rien a verifier.
  IF TG_OP = 'UPDATE' AND OLD.slot_id IS NOT DISTINCT FROM NEW.slot_id THEN
    RETURN NEW;
  END IF;

  -- Deux colonnes projetees, DEUX variables cibles. La version d'origine
  -- ecrivait `SELECT max_candidates, status INTO v_max`, ce que PL/pgSQL
  -- refuse a l'execution : toute affectation echouait.
  -- FOR UPDATE serialise reellement les affectations concurrentes ; en
  -- READ COMMITTED, un COUNT(*) seul ne garantit rien.
  SELECT sl.max_candidates, ses.status
    INTO v_max, v_session_status
  FROM public.recruitment_session_slots sl
  JOIN public.recruitment_sessions ses ON ses.id = sl.session_id
  WHERE sl.id = NEW.slot_id
  FOR UPDATE OF sl;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Créneau introuvable' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_session_status <> 'open' THEN
    RAISE EXCEPTION 'La session n''est pas ouverte aux inscriptions' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*)
    INTO v_count
  FROM public.recruitment_submissions
  WHERE slot_id = NEW.slot_id
    AND status <> 'declined'
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Ce créneau est complet (capacité maximale atteinte)' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recruitment_submissions_capacity
  BEFORE INSERT OR UPDATE OF slot_id ON public.recruitment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.check_recruitment_slot_capacity();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
-- Aucune policy FOR ALL : elle s'appliquerait aussi au SELECT et importerait
-- dans chaque lecture les dependances de la table interrogee par son USING.
-- C'est ce mecanisme qui produisait « permission denied for table
-- project_members » sur recruitment_sessions.
ALTER TABLE public.recruitment_session_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recruitment_slots_public_read" ON public.recruitment_session_slots;
CREATE POLICY "recruitment_slots_public_read"
  ON public.recruitment_session_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_sessions s
      WHERE s.id = session_id AND s.status = 'open'
    )
  );

DROP POLICY IF EXISTS "recruitment_slots_admin_read" ON public.recruitment_session_slots;
CREATE POLICY "recruitment_slots_admin_read"
  ON public.recruitment_session_slots FOR SELECT
  USING (public.get_my_role() IN ('admin', 'moderator'));

DROP POLICY IF EXISTS "recruitment_slots_admin_insert" ON public.recruitment_session_slots;
CREATE POLICY "recruitment_slots_admin_insert"
  ON public.recruitment_session_slots FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'moderator'));

DROP POLICY IF EXISTS "recruitment_slots_admin_update" ON public.recruitment_session_slots;
CREATE POLICY "recruitment_slots_admin_update"
  ON public.recruitment_session_slots FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'moderator'))
  WITH CHECK (public.get_my_role() IN ('admin', 'moderator'));

DROP POLICY IF EXISTS "recruitment_slots_admin_delete" ON public.recruitment_session_slots;
CREATE POLICY "recruitment_slots_admin_delete"
  ON public.recruitment_session_slots FOR DELETE
  USING (public.get_my_role() IN ('admin', 'moderator'));

-- ── 6. Grants ────────────────────────────────────────────────────────────────
GRANT SELECT ON public.recruitment_session_slots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.recruitment_session_slots TO authenticated;

-- L'ancien verrou colonne portait sur session_id, qui disparait.
REVOKE UPDATE (session_id) ON public.recruitment_submissions FROM authenticated;
GRANT  UPDATE (slot_id)    ON public.recruitment_submissions TO authenticated;

-- ── 7. Suppression des colonnes remplacees ───────────────────────────────────
ALTER TABLE public.recruitment_submissions DROP COLUMN IF EXISTS session_id;

ALTER TABLE public.recruitment_sessions
  DROP COLUMN IF EXISTS scheduled_at,
  DROP COLUMN IF EXISTS duration_minutes,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS max_candidates;
```

- [ ] **Step 4 : Appliquer la migration**

Run: `npx supabase db push`
Expected: la migration `20260727160000_recruitment_session_slots` est appliquée sans erreur.

- [ ] **Step 5 : Relancer la vérification**

Run: `npm run verify:slots`
Expected: `TOUT PASSE`, exit code 0.

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/20260727160000_recruitment_session_slots.sql scripts/verify-recruitment-slots.mjs package.json
git commit -m "feat(recrutement): table des creneaux horaires et capacite par creneau"
```

---

### Task 2 : Fonctions Postgres de création et d'édition atomiques

**Files:**
- Create: `supabase/migrations/20260727161000_recruitment_session_slot_rpc.sql`
- Modify: `scripts/verify-recruitment-slots.mjs`

**Interfaces:**
- Consumes : la table et la colonne produites par la Task 1.
- Produces :
  - `public.create_recruitment_session_with_slots(p_title text, p_description text, p_status text, p_created_by uuid, p_slots jsonb) RETURNS uuid`
  - `public.replace_recruitment_session_slots(p_session_id uuid, p_slots jsonb) RETURNS void`
  - Chaque entrée de `p_slots` : `{ "id"?: uuid, "starts_at": iso8601, "ends_at": iso8601, "location": string|null, "max_candidates": integer }`.

- [ ] **Step 1 : Ajouter les vérifications au script (elles doivent échouer)**

Ajouter à la fin de `scripts/verify-recruitment-slots.mjs`, **avant** le bloc final qui affiche le résultat :

```js
// 6. Creation atomique : session + creneaux en un appel.
const { data: adminUser } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
const createdBy = adminUser?.users?.[0]?.id ?? null;
const base = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const iso = (h) => new Date(base.getTime() + h * 3600 * 1000).toISOString();

const created = await admin.rpc('create_recruitment_session_with_slots', {
  p_title: '[verif] session temporaire',
  p_description: null,
  p_status: 'open',
  p_created_by: createdBy,
  p_slots: [
    { starts_at: iso(0), ends_at: iso(2), location: 'Salle A', max_candidates: 1 },
    { starts_at: iso(24), ends_at: iso(26), location: null, max_candidates: 5 },
  ],
});
check('create_recruitment_session_with_slots', !created.error, created.error?.message ?? '');
const tempSessionId = created.data ?? null;

if (tempSessionId) {
  const tempSlots = await admin
    .from('recruitment_session_slots')
    .select('id, max_candidates')
    .eq('session_id', tempSessionId)
    .order('starts_at', { ascending: true });
  check('deux creneaux crees', (tempSlots.data ?? []).length === 2);

  // 7. Le trigger de capacite refuse la place en trop.
  const firstSlot = tempSlots.data?.[0];
  if (firstSlot) {
    const a = await admin.from('recruitment_submissions').insert({
      first_name: 'Verif', last_name: 'Un', email: `verif-1-${Date.now()}@example.invalid`,
      slot_id: firstSlot.id,
    }).select('id').single();
    check('1re candidature acceptee sur un creneau a 1 place', !a.error, a.error?.message ?? '');

    const b = await admin.from('recruitment_submissions').insert({
      first_name: 'Verif', last_name: 'Deux', email: `verif-2-${Date.now()}@example.invalid`,
      slot_id: firstSlot.id,
    }).select('id').single();
    check('2e candidature refusee (creneau complet)', Boolean(b.error), b.error ? '' : 'aucune erreur levee');

    // 8. Un creneau occupe ne peut pas etre supprime par un remplacement.
    const refused = await admin.rpc('replace_recruitment_session_slots', {
      p_session_id: tempSessionId,
      p_slots: [{ starts_at: iso(48), ends_at: iso(50), location: null, max_candidates: 3 }],
    });
    check('suppression d\'un creneau occupe refusee', Boolean(refused.error));

    if (a.data?.id) await admin.from('recruitment_submissions').delete().eq('id', a.data.id);
  }

  await admin.from('recruitment_sessions').delete().eq('id', tempSessionId);
}
```

- [ ] **Step 2 : Lancer la vérification pour confirmer l'échec**

Run: `npm run verify:slots`
Expected: FAIL — `create_recruitment_session_with_slots` échoue (`Could not find the function public.create_recruitment_session_with_slots`).

- [ ] **Step 3 : Écrire la migration des fonctions**

Créer `supabase/migrations/20260727161000_recruitment_session_slot_rpc.sql` :

```sql
-- =============================================================================
-- Migration : ecriture atomique des sessions de recrutement et de leurs creneaux
-- Date : 2026-07-27
-- =============================================================================
-- Le client Supabase ne sait pas grouper deux `insert` dans une transaction.
-- Une session creee sans creneau serait invisible cote public et incoherente
-- cote admin. D'ou ces deux fonctions.
--
-- AUTORISATION : ces fonctions sont reservees a service_role. L'autorisation
-- metier reste le fait de requireAdmin() dans les routes API, comme pour toutes
-- les ecritures admin de ce depot. On ne verifie donc PAS get_my_role() ici :
-- appelees via la cle service_role, il n'y a aucun JWT utilisateur a lire.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_recruitment_session_with_slots(
  p_title       text,
  p_description text,
  p_status      text,
  p_created_by  uuid,
  p_slots       jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
    RAISE EXCEPTION 'Une session doit comporter au moins un créneau'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.recruitment_sessions (title, description, status, created_by)
  VALUES (p_title, p_description, coalesce(p_status, 'open'), p_created_by)
  RETURNING id INTO v_session_id;

  INSERT INTO public.recruitment_session_slots
    (session_id, starts_at, ends_at, location, max_candidates)
  SELECT v_session_id,
         (e->>'starts_at')::timestamptz,
         (e->>'ends_at')::timestamptz,
         nullif(e->>'location', ''),
         (e->>'max_candidates')::integer
  FROM jsonb_array_elements(p_slots) e;

  RETURN v_session_id;
END;
$$;

COMMENT ON FUNCTION public.create_recruitment_session_with_slots(text, text, text, uuid, jsonb)
  IS 'Cree une session et ses creneaux en une transaction. Reservee a service_role.';

CREATE OR REPLACE FUNCTION public.replace_recruitment_session_slots(
  p_session_id uuid,
  p_slots      jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep     uuid[];
  v_blocked  integer;
  v_shrunk   integer;
BEGIN
  IF jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
    RAISE EXCEPTION 'Une session doit garder au moins un créneau'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Creneaux conserves : ceux dont l'entree porte un id.
  SELECT coalesce(array_agg((e->>'id')::uuid), ARRAY[]::uuid[])
    INTO v_keep
  FROM jsonb_array_elements(p_slots) e
  WHERE nullif(e->>'id', '') IS NOT NULL;

  -- Refus si un creneau a supprimer porte encore des candidatures actives.
  SELECT count(*)
    INTO v_blocked
  FROM public.recruitment_session_slots sl
  WHERE sl.session_id = p_session_id
    AND NOT (sl.id = ANY (v_keep))
    AND EXISTS (
      SELECT 1 FROM public.recruitment_submissions sub
      WHERE sub.slot_id = sl.id AND sub.status <> 'declined'
    );

  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'Un créneau supprimé porte encore des candidatures : retirez-les d''abord'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Refus si un creneau conserve voit sa capacite passer sous son effectif.
  -- Le trigger de capacite est monte sur recruitment_submissions : il ne se
  -- declenche pas quand c'est le creneau qui retrecit.
  SELECT count(*)
    INTO v_shrunk
  FROM jsonb_array_elements(p_slots) e
  JOIN public.recruitment_session_slots sl ON sl.id = (e->>'id')::uuid
  WHERE nullif(e->>'id', '') IS NOT NULL
    AND sl.session_id = p_session_id
    AND (e->>'max_candidates')::integer < (
      SELECT count(*) FROM public.recruitment_submissions sub
      WHERE sub.slot_id = sl.id AND sub.status <> 'declined'
    );

  IF v_shrunk > 0 THEN
    RAISE EXCEPTION 'Un créneau ne peut pas avoir moins de places que de candidats déjà inscrits'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.recruitment_session_slots
  WHERE session_id = p_session_id
    AND NOT (id = ANY (v_keep));

  UPDATE public.recruitment_session_slots sl
  SET starts_at      = (e->>'starts_at')::timestamptz,
      ends_at        = (e->>'ends_at')::timestamptz,
      location       = nullif(e->>'location', ''),
      max_candidates = (e->>'max_candidates')::integer
  FROM jsonb_array_elements(p_slots) e
  WHERE sl.session_id = p_session_id
    AND nullif(e->>'id', '') IS NOT NULL
    AND sl.id = (e->>'id')::uuid;

  INSERT INTO public.recruitment_session_slots
    (session_id, starts_at, ends_at, location, max_candidates)
  SELECT p_session_id,
         (e->>'starts_at')::timestamptz,
         (e->>'ends_at')::timestamptz,
         nullif(e->>'location', ''),
         (e->>'max_candidates')::integer
  FROM jsonb_array_elements(p_slots) e
  WHERE nullif(e->>'id', '') IS NULL;
END;
$$;

COMMENT ON FUNCTION public.replace_recruitment_session_slots(uuid, jsonb)
  IS 'Remplace les creneaux d''une session en une transaction. Reservee a service_role.';

-- Reservation a service_role : ces fonctions contournent la RLS.
REVOKE ALL ON FUNCTION public.create_recruitment_session_with_slots(text, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_recruitment_session_slots(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_recruitment_session_with_slots(text, text, text, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_recruitment_session_slots(uuid, jsonb)
  TO service_role;
```

- [ ] **Step 4 : Appliquer et vérifier**

Run: `npx supabase db push && npm run verify:slots`
Expected: `TOUT PASSE`. Les vérifications 6 à 8 confirment la création atomique, le refus de la place en trop et le refus de supprimer un créneau occupé.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260727161000_recruitment_session_slot_rpc.sql scripts/verify-recruitment-slots.mjs
git commit -m "feat(recrutement): fonctions d'ecriture atomique des sessions et creneaux"
```

---

### Task 3 : Types et helpers partagés

**Files:**
- Modify: `src/types/recruitment.ts`
- Modify: `src/lib/recruitmentSessions.ts`

**Interfaces:**
- Produces :
  - `RecruitmentSessionSlot` : `{ id, session_id, starts_at, ends_at, location, max_candidates }`
  - `RecruitmentSessionSlotWithStats extends RecruitmentSessionSlot` : `+ { candidate_count, places_remaining }`
  - `RecruitmentSession` : `{ id, title, description, status, created_by, created_at, updated_at }`
  - `RecruitmentSessionWithSlots extends RecruitmentSession` : `+ { slots: RecruitmentSessionSlotWithStats[] }`
  - `RecruitmentSubmission` : `slot_id` remplace `session_id`
  - `PUBLIC_SESSION_COLUMNS = 'id, title, description, status'`
  - `PUBLIC_SLOT_COLUMNS = 'id, session_id, starts_at, ends_at, location, max_candidates'`
  - `countActiveCandidatesBySlot(slotIds: string[]): Promise<Record<string, number>>`
  - `withSlotStats(slots, counts): RecruitmentSessionSlotWithStats[]`
  - `type SlotInput = { id?: string; starts_at: string; ends_at: string; location: string | null; max_candidates: number }`
  - `parseSlotsPayload(value: unknown): { slots: SlotInput[] } | { error: string }`

- [ ] **Step 1 : Mettre à jour les types**

Dans `src/types/recruitment.ts`, remplacer `RecruitmentSession` et `RecruitmentSessionWithStats`, et corriger `RecruitmentSubmission` :

```ts
export interface RecruitmentSession {
  id: string;
  title: string;
  description: string | null;
  status: RecruitmentSessionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecruitmentSessionSlot {
  id: string;
  session_id: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  max_candidates: number;
}

export interface RecruitmentSessionSlotWithStats extends RecruitmentSessionSlot {
  candidate_count: number;
  places_remaining: number;
}

export interface RecruitmentSessionWithSlots extends RecruitmentSession {
  slots: RecruitmentSessionSlotWithStats[];
}
```

Dans `RecruitmentSubmission`, remplacer la propriété `session_id: string | null;` par :

```ts
  /**
   * Creneau auquel le candidat est affecte. NULL = candidature spontanee.
   */
  slot_id: string | null;
```

Remplacer `RecruitmentSubmissionWithSession` par :

```ts
export interface RecruitmentSubmissionWithSlot extends RecruitmentSubmission {
  recruitment_session_slots: (RecruitmentSessionSlot & {
    recruitment_sessions: RecruitmentSession | null;
  }) | null;
}
```

- [ ] **Step 2 : Réécrire les helpers**

Remplacer entièrement le contenu de `src/lib/recruitmentSessions.ts` :

```ts
// src/lib/recruitmentSessions.ts
// Helpers partages par les vues publiques et admin des sessions de recrutement.

import { createSupabaseAdminClient } from '@/lib/supabase';
import type {
  RecruitmentSessionSlot,
  RecruitmentSessionSlotWithStats,
} from '@/types/recruitment';

/**
 * Colonnes exposables publiquement. `created_by` (uuid d'un compte admin),
 * `created_at` et `updated_at` restent internes : `select('*')` les diffusait
 * a tout visiteur anonyme via /api/recruitment/sessions.
 */
export const PUBLIC_SESSION_COLUMNS = 'id, title, description, status';

/** Colonnes de creneau exposables publiquement. */
export const PUBLIC_SLOT_COLUMNS =
  'id, session_id, starts_at, ends_at, location, max_candidates';

/**
 * Nombre de candidatures actives (hors `declined`) par creneau.
 *
 * Passe obligatoirement par le client admin : la policy
 * `recruitment_admin_select` reserve la lecture de `recruitment_submissions`
 * aux admins. Compte avec le client visiteur, la requete renvoyait zero ligne
 * sans erreur, donc `places_remaining` valait toujours `max_candidates` : les
 * creneaux complets s'affichaient disponibles et le candidat se prenait un
 * refus au moment d'envoyer sa candidature.
 *
 * Seuls des agregats sortent d'ici, jamais de donnee nominative.
 */
export async function countActiveCandidatesBySlot(
  slotIds: string[],
): Promise<Record<string, number>> {
  if (slotIds.length === 0) return {};

  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_submissions')
    .select('slot_id')
    .in('slot_id', slotIds)
    .neq('status', 'declined');

  if (error) {
    console.error('[recruitmentSessions] comptage impossible:', error.message);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { slot_id: string | null }[]) {
    if (row.slot_id) counts[row.slot_id] = (counts[row.slot_id] ?? 0) + 1;
  }
  return counts;
}

/** Ajoute inscrits et places restantes a une liste de creneaux. */
export function withSlotStats(
  slots: RecruitmentSessionSlot[],
  counts: Record<string, number>,
): RecruitmentSessionSlotWithStats[] {
  return slots.map((slot) => {
    const candidateCount = counts[slot.id] ?? 0;
    return {
      ...slot,
      candidate_count: candidateCount,
      places_remaining: Math.max(0, slot.max_candidates - candidateCount),
    };
  });
}

const MAX_SLOTS = 20;
const MAX_LOCATION = 300;

export type SlotInput = {
  id?: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  max_candidates: number;
};

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Valide la liste de creneaux envoyee par le formulaire admin. Vit ici plutot
 * que dans une route : la creation (POST /api/admin/recruitment-sessions) et
 * l'edition (PUT .../[id]/slots) doivent appliquer exactement les memes bornes,
 * et une route ne s'importe pas depuis une autre route.
 * Les bornes reprennent celles de l'ancienne validation par session.
 */
export function parseSlotsPayload(value: unknown): { slots: SlotInput[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: 'Au moins un créneau est obligatoire.' };
  }
  if (value.length > MAX_SLOTS) {
    return { error: `Une session ne peut pas dépasser ${MAX_SLOTS} créneaux.` };
  }

  const slots: SlotInput[] = [];
  for (const [index, raw] of value.entries()) {
    const position = index + 1;
    if (typeof raw !== 'object' || raw === null) {
      return { error: `Créneau ${position} : format invalide.` };
    }
    const entry = raw as Record<string, unknown>;

    const startsAt = parseIsoDate(entry.starts_at);
    const endsAt = parseIsoDate(entry.ends_at);
    if (!startsAt) return { error: `Créneau ${position} : date ou heure de début invalide.` };
    if (!endsAt) return { error: `Créneau ${position} : date ou heure de fin invalide.` };
    if (new Date(endsAt) <= new Date(startsAt)) {
      return { error: `Créneau ${position} : l'heure de fin doit suivre l'heure de début.` };
    }

    const maxCandidates = typeof entry.max_candidates === 'number' ? entry.max_candidates : NaN;
    if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) {
      return { error: `Créneau ${position} : le nombre de places doit être compris entre 1 et 100.` };
    }

    const location = typeof entry.location === 'string' ? entry.location.trim() || null : null;
    if (location && location.length > MAX_LOCATION) {
      return { error: `Créneau ${position} : le lieu/lien ne doit pas dépasser ${MAX_LOCATION} caractères.` };
    }

    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : undefined;
    slots.push({ id, starts_at: startsAt, ends_at: endsAt, location, max_candidates: maxCandidates });
  }

  return { slots };
}
```

- [ ] **Step 3 : Vérifier que le typage casse aux bons endroits**

Run: `npx astro check`
Expected: des erreurs de type dans les fichiers des Tasks 4 à 10 (`session_id` inexistant, `scheduled_at` inexistant, `countActiveCandidatesBySession` introuvable). C'est le résultat attendu : la liste de ces erreurs est la feuille de route des tâches suivantes. Aucune erreur ne doit provenir de `src/types/recruitment.ts` ni de `src/lib/recruitmentSessions.ts`.

- [ ] **Step 4 : Commit**

```bash
git add src/types/recruitment.ts src/lib/recruitmentSessions.ts
git commit -m "refactor(recrutement): types et helpers bascules sur les creneaux"
```

---

### Task 4 : API admin — création et liste des sessions

**Files:**
- Modify: `src/pages/api/admin/recruitment-sessions/index.ts`

**Interfaces:**
- Consumes : `create_recruitment_session_with_slots` (Task 2) ; `countActiveCandidatesBySlot`, `withSlotStats`, `PUBLIC_SLOT_COLUMNS`, `parseSlotsPayload`, `SlotInput` (Task 3).
- Produces : `POST /api/admin/recruitment-sessions`, corps `{ title, description, status, slots: SlotInput[] }`, réponse `201 { id }`.

- [ ] **Step 1 : Nettoyer les constantes devenues inutiles**

Dans `src/pages/api/admin/recruitment-sessions/index.ts`, supprimer `MAX_LOCATION` et la fonction locale `parseIsoDate` — la validation des créneaux vit désormais dans `src/lib/recruitmentSessions.ts` (Task 3), partagée avec la route d'édition. Ne garder que :

```ts
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
```

et ajouter aux imports :

```ts
import { parseSlotsPayload, type SlotInput } from '@/lib/recruitmentSessions';
```

- [ ] **Step 2 : Réécrire le GET**

Remplacer le corps du `GET` par :

```ts
export const GET: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const admin = createSupabaseAdminClient();

  const { data: sessions, error } = await admin
    .from('recruitment_sessions')
    .select('id, title, description, status, created_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des sessions' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionIds = (sessions ?? []).map((s: RecruitmentSession) => s.id);
  const { data: slotRows } = sessionIds.length
    ? await admin
        .from('recruitment_session_slots')
        .select(PUBLIC_SLOT_COLUMNS)
        .in('session_id', sessionIds)
        .order('starts_at', { ascending: true })
    : { data: [] as RecruitmentSessionSlot[] };

  const slots = (slotRows ?? []) as unknown as RecruitmentSessionSlot[];
  const counts = await countActiveCandidatesBySlot(slots.map((s) => s.id));
  const slotsWithStats = withSlotStats(slots, counts);

  const sessionsWithSlots = (sessions ?? []).map((s: RecruitmentSession) => ({
    ...s,
    slots: slotsWithStats.filter((slot) => slot.session_id === s.id),
  }));

  return new Response(JSON.stringify(sessionsWithSlots), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

Ajouter aux imports du fichier :

```ts
import {
  PUBLIC_SLOT_COLUMNS,
  countActiveCandidatesBySlot,
  withSlotStats,
} from '@/lib/recruitmentSessions';
import type { RecruitmentSession, RecruitmentSessionSlot, RecruitmentSessionStatus } from '@/types/recruitment';
```

- [ ] **Step 3 : Réécrire le POST**

Remplacer, dans le `POST`, tout le bloc allant de `const title = ...` jusqu'au `return` final par :

```ts
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const status = isValidSessionStatus(body.status) ? body.status : 'open';

  const errors: string[] = [];
  if (!title) errors.push('Le titre est obligatoire.');
  else if (title.length > MAX_TITLE) errors.push(`Le titre ne doit pas dépasser ${MAX_TITLE} caractères.`);
  if (description && description.length > MAX_DESCRIPTION) {
    errors.push(`La description ne doit pas dépasser ${MAX_DESCRIPTION} caractères.`);
  }

  const parsedSlots = parseSlotsPayload(body.slots);
  if ('error' in parsedSlots) errors.push(parsedSlots.error);

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: errors.join(' ') }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createSupabaseAdminClient();
  const { data: sessionId, error } = await admin.rpc('create_recruitment_session_with_slots', {
    p_title: title,
    p_description: description,
    p_status: status,
    p_created_by: user.id,
    p_slots: (parsedSlots as { slots: SlotInput[] }).slots,
  });

  if (error) {
    console.error('[recruitment-sessions create]', error.code, error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la création de la session.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ id: sessionId }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
```

- [ ] **Step 4 : Vérifier le typage du fichier**

Run: `npx astro check 2>&1 | grep "recruitment-sessions/index.ts"`
Expected: aucune ligne — plus d'erreur dans ce fichier.

- [ ] **Step 5 : Commit**

```bash
git add src/pages/api/admin/recruitment-sessions/index.ts
git commit -m "feat(api): creation d'une session avec ses creneaux"
```

---

### Task 5 : API admin — édition, suppression, affectation

**Files:**
- Create: `src/pages/api/admin/recruitment-sessions/[id]/slots.ts`
- Modify: `src/pages/api/admin/recruitment-sessions/[id].ts`
- Modify: `src/pages/api/admin/recruitment-sessions/[id]/assign.ts`
- Modify: `src/pages/api/admin/candidatures/unassign.ts`

**Interfaces:**
- Consumes : `parseSlotsPayload`, `SlotInput` (Task 3) ; `replace_recruitment_session_slots` (Task 2) ; `notifySlotAssigned`, `notifySlotUnassigned` (Task 7 — signatures données ci-dessous, à câbler après la Task 7).
- Produces : `PUT /api/admin/recruitment-sessions/[id]/slots`, corps `{ slots: SlotInput[] }`.

- [ ] **Step 1 : Créer la route de remplacement des créneaux**

Créer `src/pages/api/admin/recruitment-sessions/[id]/slots.ts` :

```ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';
import { parseSlotsPayload, type SlotInput } from '@/lib/recruitmentSessions';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** PUT /api/admin/recruitment-sessions/[id]/slots — remplace la liste des créneaux. */
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'ID de session invalide' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide.' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const parsed = parseSlotsPayload(body.slots);
  if ('error' in parsed) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 422,
      headers: JSON_HEADERS,
    });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc('replace_recruitment_session_slots', {
    p_session_id: id,
    p_slots: (parsed as { slots: SlotInput[] }).slots,
  });

  if (error) {
    // 23514 = check_violation : les refus metier leves par la fonction
    // (creneau occupe, capacite sous l'effectif, liste vide). Leurs messages
    // sont ecrits en francais et destines a l'admin : on les transmet tels
    // quels. Tout le reste est une vraie panne.
    const isBusinessConflict = error.code === '23514';
    if (!isBusinessConflict) {
      console.error('[recruitment slots replace]', error.code, error.message);
    }
    return new Response(
      JSON.stringify({
        error: isBusinessConflict
          ? (error.message || 'Modification des créneaux refusée.')
          : 'Erreur lors de la mise à jour des créneaux.',
      }),
      { status: isBusinessConflict ? 409 : 500, headers: JSON_HEADERS },
    );
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
};
```

- [ ] **Step 2 : Alléger `[id].ts`**

Dans `src/pages/api/admin/recruitment-sessions/[id].ts` :

1. Dans le `GET`, remplacer la lecture de la session et le calcul des places par une lecture de la session **et** de ses créneaux :

```ts
  const { data: session, error: sessionError } = await admin
    .from('recruitment_sessions')
    .select('id, title, description, status, created_by, created_at, updated_at')
    .eq('id', id)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: 'Session introuvable.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: slotRows } = await admin
    .from('recruitment_session_slots')
    .select(PUBLIC_SLOT_COLUMNS)
    .eq('session_id', id)
    .order('starts_at', { ascending: true });

  const slots = (slotRows ?? []) as unknown as RecruitmentSessionSlot[];
  const counts = await countActiveCandidatesBySlot(slots.map((s) => s.id));
  const payload = { ...session, slots: withSlotStats(slots, counts) };
```

et renvoyer `payload`.

2. Dans le `PATCH`, **supprimer** les blocs traitant `body.scheduled_at`, `body.duration_minutes`, `body.max_candidates`, `body.location`, ainsi que le contrôle « réduire max_candidates sous l'effectif » (il vit désormais dans `replace_recruitment_session_slots`). Ne conserver que `title`, `description`, `status`.

3. Dans le `DELETE`, remplacer le comptage des candidatures rattachées par :

```ts
  const { count, error: countError } = await admin
    .from('recruitment_submissions')
    .select('id, recruitment_session_slots!inner(session_id)', { count: 'exact', head: true })
    .eq('recruitment_session_slots.session_id', id);

  if (countError) {
    console.error('[recruitment-sessions delete] count error:', countError.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la suppression.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if ((count ?? 0) > 0) {
    return new Response(
      JSON.stringify({ error: 'Des candidatures sont rattachées à un créneau de cette session : retirez-les d\'abord.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }
```

Ajouter aux imports :

```ts
import { PUBLIC_SLOT_COLUMNS, countActiveCandidatesBySlot, withSlotStats } from '@/lib/recruitmentSessions';
import type { RecruitmentSessionSlot } from '@/types/recruitment';
```

- [ ] **Step 3 : Affecter à un créneau plutôt qu'à une session**

Dans `src/pages/api/admin/recruitment-sessions/[id]/assign.ts`, `POST` :

1. Après la validation de `submission_id`, lire et valider le créneau cible :

```ts
  const slotId = body.slot_id;
  if (!isValidUUID(slotId)) {
    return new Response(JSON.stringify({ error: 'Créneau invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
```

2. Remplacer la lecture de la session par une lecture jointe créneau + session, qui vérifie du même coup l'appartenance :

```ts
  const { data: slot, error: slotError } = await admin
    .from('recruitment_session_slots')
    .select('id, session_id, starts_at, ends_at, location, max_candidates, recruitment_sessions(id, title, status)')
    .eq('id', slotId)
    .eq('session_id', id)
    .single();

  if (slotError || !slot) {
    return new Response(JSON.stringify({ error: 'Créneau introuvable pour cette session.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = (slot as unknown as { recruitment_sessions: { id: string; title: string; status: string } | null })
    .recruitment_sessions;

  if (!session || session.status !== 'open') {
    return new Response(JSON.stringify({ error: 'La session n\'est pas ouverte aux inscriptions.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }
```

3. Remplacer `.update({ session_id: id })` par `.update({ slot_id: slotId })`. Conserver tel quel le traitement d'erreur existant : le code `23514` reste le signal du conflit métier levé par le trigger, tout autre code reste une panne à journaliser en 500.

4. Dans le `DELETE` du même fichier, remplacer `.update({ session_id: null })` par `.update({ slot_id: null })` et le filtre `.eq('session_id', id)` par `.eq('slot_id', body.slot_id)`, en validant `slot_id` comme au point 1. Le message « Cette candidature n'est pas rattachée à cette session. » devient « Cette candidature n'est pas rattachée à ce créneau. ».

- [ ] **Step 4 : Corriger la désaffectation globale**

Dans `src/pages/api/admin/candidatures/unassign.ts`, remplacer `.update({ session_id: null })` par `.update({ slot_id: null })`.

- [ ] **Step 5 : Vérifier le typage**

Run: `npx astro check 2>&1 | grep -E "recruitment-sessions|candidatures/unassign"`
Expected: aucune ligne, à l'exception d'éventuelles erreurs sur `notifySessionAssigned` / `notifySessionUnassigned`, traitées en Task 7.

- [ ] **Step 6 : Commit**

```bash
git add src/pages/api/admin/recruitment-sessions src/pages/api/admin/candidatures/unassign.ts
git commit -m "feat(api): edition des creneaux et affectation par creneau"
```

---

### Task 6 : API publique — liste des créneaux et dépôt de candidature

**Files:**
- Modify: `src/pages/api/recruitment/sessions.ts`
- Modify: `src/pages/api/recruitment.ts`

**Interfaces:**
- Consumes : `PUBLIC_SESSION_COLUMNS`, `PUBLIC_SLOT_COLUMNS`, `countActiveCandidatesBySlot`, `withSlotStats` (Task 3).
- Produces : le contrat JSON consommé par `RecruitmentFormClient` (Task 10) :
  `Array<{ id, title, description, status, slots: Array<{ id, session_id, starts_at, ends_at, location, max_candidates, candidate_count, places_remaining }> }>`

- [ ] **Step 1 : Réécrire la route publique des sessions**

Remplacer entièrement `src/pages/api/recruitment/sessions.ts` :

```ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  PUBLIC_SESSION_COLUMNS,
  PUBLIC_SLOT_COLUMNS,
  countActiveCandidatesBySlot,
  withSlotStats,
} from '@/lib/recruitmentSessions';
import type { RecruitmentSession, RecruitmentSessionSlot } from '@/types/recruitment';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** GET /api/recruitment/sessions — sessions ouvertes ayant au moins un créneau à venir. */
export const GET: APIRoute = async () => {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: sessionRows, error: sessionsError } = await admin
    .from('recruitment_sessions')
    .select(PUBLIC_SESSION_COLUMNS)
    .eq('status', 'open');

  if (sessionsError) {
    console.error('[api/recruitment/sessions] erreur sessions:', sessionsError.message);
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des sessions.' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const sessions = (sessionRows ?? []) as unknown as RecruitmentSession[];
  if (sessions.length === 0) {
    return new Response(JSON.stringify([]), { status: 200, headers: JSON_HEADERS });
  }

  const { data: slotRows, error: slotsError } = await admin
    .from('recruitment_session_slots')
    .select(PUBLIC_SLOT_COLUMNS)
    .in('session_id', sessions.map((s) => s.id))
    .gt('starts_at', now)
    .order('starts_at', { ascending: true });

  if (slotsError) {
    console.error('[api/recruitment/sessions] erreur creneaux:', slotsError.message);
    return new Response(JSON.stringify({ error: 'Erreur lors du chargement des sessions.' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const slots = (slotRows ?? []) as unknown as RecruitmentSessionSlot[];
  const counts = await countActiveCandidatesBySlot(slots.map((s) => s.id));
  const slotsWithStats = withSlotStats(slots, counts);

  // Une session sans creneau a venir n'a rien a proposer : on ne l'expose pas.
  const payload = sessions
    .map((session) => ({
      ...session,
      slots: slotsWithStats.filter((slot) => slot.session_id === session.id),
    }))
    .filter((session) => session.slots.length > 0);

  return new Response(JSON.stringify(payload), { status: 200, headers: JSON_HEADERS });
};
```

- [ ] **Step 2 : Basculer le dépôt de candidature sur le créneau**

Dans `src/pages/api/recruitment.ts` :

1. Dans la lecture du corps, remplacer la ligne `session_id: ...` par :

```ts
    slot_id: typeof body.slot_id === 'string' && body.slot_id.trim() ? body.slot_id.trim() : null,
```

2. Renommer la variable déstructurée `session_id` en `slot_id` dans le `const { ... } = ...`.

3. Remplacer les validations qui la concernent :

```ts
  if (slot_id && !isValidUUID(slot_id)) {
    errors.slot_id = ['Créneau sélectionné invalide.'];
  }
```

et, pour la règle « compte requis » :

```ts
  if (slot_id && !user) {
    return new Response(
      JSON.stringify({
        message: 'Un compte est nécessaire pour choisir un créneau.',
        errors: { slot_id: ['Compte requis pour choisir un créneau.'] },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }
```

4. Remplacer le bloc « 6. Vérifier la session sélectionnée » par sa version créneau :

```ts
  // 6. Vérifier le créneau sélectionné (session ouverte, créneau à venir et non plein)
  if (slot_id) {
    const { data: slot, error: slotError } = await supabase
      .from('recruitment_session_slots')
      .select('id, starts_at, max_candidates, recruitment_sessions!inner(status)')
      .eq('id', slot_id)
      .eq('recruitment_sessions.status', 'open')
      .gt('starts_at', new Date().toISOString())
      .single();

    if (slotError || !slot) {
      return new Response(
        JSON.stringify({ message: 'Le créneau sélectionné n\'est pas disponible.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { count, error: countError } = await supabase
      .from('recruitment_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('slot_id', slot_id)
      .neq('status', 'declined');

    if (!countError && count != null && count >= slot.max_candidates) {
      return new Response(
        JSON.stringify({ message: 'Le créneau sélectionné est complet.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
```

Ce pré-contrôle sert à rendre un message clair ; la garantie reste le trigger de capacité, qui tranche les soumissions simultanées.

5. Dans l'`insert` final, remplacer `session_id,` par `slot_id,`.

- [ ] **Step 3 : Vérifier le typage**

Run: `npx astro check 2>&1 | grep -E "api/recruitment"`
Expected: aucune ligne.

- [ ] **Step 4 : Commit**

```bash
git add src/pages/api/recruitment.ts src/pages/api/recruitment/sessions.ts
git commit -m "feat(api): candidature rattachee a un creneau"
```

---

### Task 7 : E-mails de confirmation

**Files:**
- Modify: `src/lib/recruitmentMail.ts`
- Modify: `src/pages/api/admin/recruitment-sessions/[id]/assign.ts`

**Interfaces:**
- Produces :
  - `notifySlotAssigned(submission: RecruitmentSubmission, session: Pick<RecruitmentSession, 'id' | 'title'>, slot: RecruitmentSessionSlot): Promise<void>`
  - `notifySlotUnassigned(submission: RecruitmentSubmission): Promise<void>`

- [ ] **Step 1 : Réécrire la notification d'affectation**

Dans `src/lib/recruitmentMail.ts`, remplacer `notifySessionAssigned` par :

```ts
export async function notifySlotAssigned(
  submission: RecruitmentSubmission,
  session: Pick<RecruitmentSession, 'id' | 'title'>,
  slot: RecruitmentSessionSlot,
) {
  const { html, text } = emailWrapper(
    'Session de recrutement confirmée',
    `<p>Bonjour ${escapeHtml(submission.first_name)} ${escapeHtml(submission.last_name)},</p>
     <p>Votre candidature a été rattachée à une session de recrutement collective :</p>
     <dl class="meta">
       <dt>Session</dt><dd>${escapeHtml(session.title)}</dd>
       <dt>Date</dt><dd>${escapeHtml(formatDateTimeLong(slot.starts_at))}</dd>
       <dt>Horaire</dt><dd>de ${escapeHtml(toHHmm(slot.starts_at))} à ${escapeHtml(toHHmm(slot.ends_at))}</dd>
       ${slot.location ? `<dt>Lieu / Lien</dt><dd>${escapeHtml(slot.location)}</dd>` : ''}
     </dl>
     <p>Nous vous recontacterons si le créneau venait à être déplacé ou annulé.</p>
     <p>À très bientôt,<br/>L'équipe Biscuits IA</p>`,
    `Vous êtes inscrit(e) à la session ${session.title}`,
  );

  await enqueueEmail(
    {
      from: FROM,
      to: { email: submission.email, name: `${submission.first_name} ${submission.last_name}` },
      subject: `Biscuits IA — Session de recrutement confirmée`,
      text,
      html,
    },
    { metadata: { type: 'recruitment_slot_assigned', slot_id: slot.id, submission_id: submission.id } },
  );
}
```

Renommer `notifySessionUnassigned` en `notifySlotUnassigned` et remplacer, dans son corps, « la session de recrutement à laquelle vous étiez affecté(e) » par « le créneau de recrutement auquel vous étiez affecté(e) ».

Adapter les imports en tête de fichier : `formatDateTimeLong` et `toHHmm` viennent de `@/lib/dateHelpers` ; remplacer l'ancien helper local `formatSessionDate` s'il n'est plus utilisé ailleurs dans le fichier. Ajouter `RecruitmentSessionSlot` aux types importés.

- [ ] **Step 2 : Câbler les nouveaux noms**

Dans `src/pages/api/admin/recruitment-sessions/[id]/assign.ts` :
- importer `notifySlotAssigned, notifySlotUnassigned` à la place des anciens noms ;
- dans le `POST`, appeler `notifySlotAssigned(updated as unknown as RecruitmentSubmission, session, slot as unknown as RecruitmentSessionSlot)` ;
- dans le `DELETE`, appeler `notifySlotUnassigned(...)`.

L'envoi reste best-effort, enveloppé dans son `try/catch` : un e-mail en échec ne doit pas faire échouer l'affectation.

- [ ] **Step 3 : Vérifier le typage**

Run: `npx astro check 2>&1 | grep -E "recruitmentMail|assign.ts"`
Expected: aucune ligne.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/recruitmentMail.ts src/pages/api/admin/recruitment-sessions/[id]/assign.ts
git commit -m "feat(mail): confirmation d'inscription au niveau du creneau"
```

---

### Task 8 : Modale de création et liste des sessions (admin)

**Files:**
- Modify: `src/pages/dashboard/admin/candidatures/sessions.astro`

**Interfaces:**
- Consumes : `POST /api/admin/recruitment-sessions` (Task 4).
- Produces : la fonction client `collectSlots()` qui transforme les lignes du formulaire en `SlotInput[]`, réutilisée telle quelle par la fiche session (Task 9).

- [ ] **Step 1 : Adapter le chargement de la page**

Dans le frontmatter, remplacer la requête et le comptage par :

```ts
const { data: sessionsRaw, error: sessionsError } = await (statusFilter
  ? adminSupabase.from('recruitment_sessions').select('id, title, description, status').eq('status', statusFilter)
  : adminSupabase.from('recruitment_sessions').select('id, title, description, status'));

if (sessionsError) {
  console.error('[admin/recruitment-sessions] error:', sessionsError.message);
}

const sessions = (sessionsRaw ?? []) as unknown as RecruitmentSession[];

const { data: slotRows } = sessions.length
  ? await adminSupabase
      .from('recruitment_session_slots')
      .select(PUBLIC_SLOT_COLUMNS)
      .in('session_id', sessions.map((s) => s.id))
      .order('starts_at', { ascending: true })
  : { data: [] };

const slots = (slotRows ?? []) as unknown as RecruitmentSessionSlot[];
const slotCounts = await countActiveCandidatesBySlot(slots.map((s) => s.id));
const slotsWithStats = withSlotStats(slots, slotCounts);

const sessionsWithSlots = sessions
  .map((s) => {
    const own = slotsWithStats.filter((slot) => slot.session_id === s.id);
    return {
      ...s,
      slots: own,
      totalPlaces: own.reduce((sum, slot) => sum + slot.max_candidates, 0),
      totalTaken: own.reduce((sum, slot) => sum + slot.candidate_count, 0),
    };
  })
  // Les sessions les plus proches d'abord ; celles sans creneau en dernier.
  .sort((a, b) => (a.slots[0]?.starts_at ?? '9999').localeCompare(b.slots[0]?.starts_at ?? '9999'));
```

Adapter les imports : `PUBLIC_SLOT_COLUMNS`, `countActiveCandidatesBySlot`, `withSlotStats` depuis `@/lib/recruitmentSessions`, et les types `RecruitmentSession`, `RecruitmentSessionSlot`.

- [ ] **Step 2 : Adapter les colonnes du tableau**

Remplacer, dans le `map` sur les sessions, les cellules *Date* et *Inscrits* :

```astro
                <td class="mono xs">
                  {s.slots.length === 0
                    ? '—'
                    : s.slots.length === 1
                      ? formatSessionDate(s.slots[0].starts_at)
                      : `${s.slots.length} créneaux · ${formatSessionDate(s.slots[0].starts_at)} → ${formatSessionDate(s.slots[s.slots.length - 1].starts_at)}`}
                </td>
                <td>
                  <span class={`badge ${s.totalPlaces > 0 && s.totalTaken >= s.totalPlaces ? 'badge-err' : 'badge-info'}`}>
                    {s.totalTaken} / {s.totalPlaces}
                  </span>
                </td>
```

et remplacer la boucle `sessions.map(...)` par `sessionsWithSlots.map(...)`, ainsi que `sessions.length` par `sessionsWithSlots.length` dans l'en-tête de page.

- [ ] **Step 3 : Remplacer les champs horaires de la modale**

Dans `<dialog id="create-session-modal">`, remplacer les deux blocs `.grid-2` (date/durée et places/lieu) par la liste répétable :

```astro
        <div class="slots" id="slots-list">
          <span class="slots__label">Créneaux *</span>
          <template id="slot-row-template">
            <div class="slot-row">
              <input type="date" name="slot_date" required class="input" aria-label="Date du créneau" />
              <input type="time" name="slot_start" required class="input" aria-label="Heure de début" />
              <input type="time" name="slot_end" required class="input" aria-label="Heure de fin" />
              <input type="number" name="slot_places" min="1" max="100" value="10" required class="input" aria-label="Places" />
              <input type="text" name="slot_location" class="input" maxlength="300" placeholder="Lieu ou lien visio" aria-label="Lieu du créneau" />
              <button type="button" class="btn btn-ghost btn-xs js-remove-slot" aria-label="Retirer ce créneau">✕</button>
            </div>
          </template>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-add-slot">+ Ajouter un créneau</button>
```

Ajouter au bloc `<style>`, sans toucher aux règles existantes :

```css
  .slots { display: flex; flex-direction: column; gap: 8px; }
  .slots__label { font-size: var(--text-xs); color: var(--text-muted); }
  .slot-row { display: grid; gap: 6px; grid-template-columns: 1.2fr 0.8fr 0.8fr 0.6fr 1.4fr auto; align-items: center; }
  @media (max-width: 760px) { .slot-row { grid-template-columns: 1fr 1fr; } }
```

- [ ] **Step 4 : Gérer les lignes et la soumission**

Dans le `<script nonce={Astro.locals.nonce}>`, conserver `tzOffsetMs` et `parisIsoFromLocalInput` tels quels, et ajouter la gestion des lignes :

```js
  const slotsList = document.getElementById('slots-list');
  const slotTemplate = document.getElementById('slot-row-template');
  const btnAddSlot = document.getElementById('btn-add-slot');

  function addSlotRow() {
    if (!(slotTemplate instanceof HTMLTemplateElement) || !slotsList) return;
    slotsList.appendChild(slotTemplate.content.cloneNode(true));
    refreshRemoveButtons();
  }

  // Une session doit garder au moins un creneau : le retrait de la derniere
  // ligne est desactive plutot que de laisser l'API refuser la soumission.
  function refreshRemoveButtons() {
    const rows = slotsList ? slotsList.querySelectorAll('.slot-row') : [];
    rows.forEach((row) => {
      const btn = row.querySelector('.js-remove-slot');
      if (btn) btn.disabled = rows.length <= 1;
    });
  }

  slotsList?.addEventListener('click', (event) => {
    const btn = event.target instanceof Element ? event.target.closest('.js-remove-slot') : null;
    if (!btn) return;
    btn.closest('.slot-row')?.remove();
    refreshRemoveButtons();
  });

  btnAddSlot?.addEventListener('click', addSlotRow);
  addSlotRow();

  /**
   * Lit les lignes de creneaux et les convertit en instants UTC.
   * Les heures saisies sont TOUJOURS interpretees comme des heures de Paris :
   * `new Date(valeur)` utiliserait le fuseau du navigateur, et un admin en
   * deplacement creerait des creneaux decales pour tous les candidats.
   */
  function collectSlots() {
    const rows = slotsList ? Array.from(slotsList.querySelectorAll('.slot-row')) : [];
    return rows.map((row) => {
      const value = (name) => {
        const field = row.querySelector(`[name="${name}"]`);
        return field ? field.value : '';
      };
      const date = value('slot_date');
      return {
        starts_at: parisIsoFromLocalInput(`${date}T${value('slot_start')}`),
        ends_at: parisIsoFromLocalInput(`${date}T${value('slot_end')}`),
        location: value('slot_location').trim() || null,
        max_candidates: Number(value('slot_places') || 10),
      };
    });
  }
```

Remplacer la construction du `payload` dans le gestionnaire de soumission par :

```js
    const slots = collectSlots();
    if (slots.some((slot) => !slot.starts_at || !slot.ends_at)) {
      toast('Chaque créneau doit avoir une date, une heure de début et une heure de fin.', 'error');
      return;
    }
    if (slots.some((slot) => slot.ends_at <= slot.starts_at)) {
      toast('L\'heure de fin doit suivre l\'heure de début.', 'error');
      return;
    }

    const payload = {
      title: String(fd.get('title') ?? '').trim(),
      description: String(fd.get('description') ?? '').trim() || null,
      status: 'open',
      slots,
    };
```

Le verrou anti double-soumission sur le bouton reste inchangé.

- [ ] **Step 5 : Vérifier dans le navigateur**

Run: `npm run dev` puis ouvrir `/dashboard/admin/candidatures/sessions` en tant qu'admin.
Expected: la modale ouvre avec une ligne de créneau ; « + Ajouter un créneau » en ajoute une ; le bouton de retrait est désactivé quand il ne reste qu'une ligne ; une session à deux créneaux se crée et apparaît dans la liste avec « 2 créneaux · … → … ».

Puis vérifier les horaires en base :

Run: `npm run verify:slots`
Expected: `TOUT PASSE`.

- [ ] **Step 6 : Commit**

```bash
git add src/pages/dashboard/admin/candidatures/sessions.astro
git commit -m "feat(admin): saisie de plusieurs creneaux a la creation d'une session"
```

---

### Task 9 : Fiche session et écran candidatures (admin)

**Files:**
- Modify: `src/pages/dashboard/admin/candidatures/sessions/[id].astro`
- Modify: `src/pages/dashboard/admin/candidatures.astro`

**Interfaces:**
- Consumes : `PUT /api/admin/recruitment-sessions/[id]/slots` (Task 5), `POST /api/admin/recruitment-sessions/[id]/assign` avec `{ submission_id, slot_id }` (Task 5).

- [ ] **Step 1 : Afficher les créneaux sur la fiche**

Dans `src/pages/dashboard/admin/candidatures/sessions/[id].astro`, remplacer le chargement par :

```ts
const { data: session, error: sessionError } = await adminSupabase
  .from('recruitment_sessions')
  .select('id, title, description, status')
  .eq('id', sessionId)
  .single();

if (sessionError || !session) return Astro.redirect('/dashboard/admin/candidatures/sessions');

const { data: slotRows } = await adminSupabase
  .from('recruitment_session_slots')
  .select(PUBLIC_SLOT_COLUMNS)
  .eq('session_id', sessionId)
  .order('starts_at', { ascending: true });

const slots = (slotRows ?? []) as unknown as RecruitmentSessionSlot[];
const slotIds = slots.map((s) => s.id);

const { data: assignedRaw } = slotIds.length
  ? await adminSupabase
      .from('recruitment_submissions')
      .select('id, first_name, last_name, email, status, slot_id')
      .in('slot_id', slotIds)
  : { data: [] };

const assigned = (assignedRaw ?? []) as unknown as Array<{
  id: string; first_name: string; last_name: string; email: string; status: string; slot_id: string;
}>;

const counts = await countActiveCandidatesBySlot(slotIds);
const slotsWithStats = withSlotStats(slots, counts);
```

Remplacer le bloc d'en-tête qui affichait `session.scheduled_at`, `session.duration_minutes` et `session.max_candidates` par un tableau des créneaux :

```astro
  <div class="card card-flush">
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Créneau</th><th>Lieu</th><th>Inscrits</th><th>Candidats</th></tr>
        </thead>
        <tbody>
          {slotsWithStats.map((slot) => (
            <tr>
              <td class="mono xs">
                {formatSessionDate(slot.starts_at)} · {toHHmm(slot.starts_at)} – {toHHmm(slot.ends_at)}
              </td>
              <td>{slot.location ?? '—'}</td>
              <td>
                <span class={`badge ${slot.places_remaining === 0 ? 'badge-err' : 'badge-info'}`}>
                  {slot.candidate_count} / {slot.max_candidates}
                </span>
              </td>
              <td>
                {assigned.filter((c) => c.slot_id === slot.id).map((c) => (
                  <div class="assigned-row">{c.first_name} {c.last_name} · {c.email}</div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
```

Importer `toHHmm` depuis `@/lib/dateHelpers`, et `PUBLIC_SLOT_COLUMNS`, `countActiveCandidatesBySlot`, `withSlotStats` depuis `@/lib/recruitmentSessions`.

- [ ] **Step 2 : Affecter à un créneau depuis l'écran candidatures**

Dans `src/pages/dashboard/admin/candidatures.astro` :

1. Remplacer le chargement des sessions assignables par le chargement des créneaux à venir des sessions ouvertes :

```ts
const { data: openSessionsRaw } = await adminSupabase
  .from('recruitment_sessions')
  .select('id, title')
  .eq('status', 'open');

const openSessions = (openSessionsRaw ?? []) as unknown as Array<{ id: string; title: string }>;
const sessionTitleById = new Map(openSessions.map((s) => [s.id, s.title]));

const { data: openSlotsRaw } = openSessions.length
  ? await adminSupabase
      .from('recruitment_session_slots')
      .select(PUBLIC_SLOT_COLUMNS)
      .in('session_id', openSessions.map((s) => s.id))
      .gt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
  : { data: [] };

const openSlots = (openSlotsRaw ?? []) as unknown as RecruitmentSessionSlot[];
const openSlotStats = withSlotStats(openSlots, await countActiveCandidatesBySlot(openSlots.map((s) => s.id)));
const assignableSlots = openSlotStats.filter((slot) => slot.places_remaining > 0);
```

2. Remplacer le `<select name="session_id">` par un sélecteur de créneau :

```astro
              <select name="slot_id" class="filter-input admin-select" data-session-id={/* conservé pour l'appel API */ ''}>
                {assignableSlots.map((slot) => (
                  <option value={slot.id} data-session={slot.session_id}>
                    {sessionTitleById.get(slot.session_id)} · {formatDateTimeLong(slot.starts_at)} – {toHHmm(slot.ends_at)} · {slot.places_remaining} place{slot.places_remaining > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
```

3. Dans le script de la page, l'appel d'affectation vise la session du créneau choisi et transmet le créneau :

```js
      const select = form.querySelector('select[name="slot_id"]');
      const slotId = select ? select.value : '';
      const sessionId = select && select.selectedOptions[0]
        ? select.selectedOptions[0].getAttribute('data-session')
        : '';
      if (!slotId || !sessionId) return;

      const res = await fetch(`/api/admin/recruitment-sessions/${sessionId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, slot_id: slotId }),
      });
```

4. Remplacer le chargement des sessions affectées par celui des créneaux affectés :

```ts
const assignedSlotIds = [
  ...new Set(((submissions ?? []) as { slot_id: string | null }[])
    .map((s) => s.slot_id)
    .filter((id): id is string => Boolean(id))),
];

const assignedSlots: Record<string, { title: string; starts_at: string; ends_at: string }> = {};
if (assignedSlotIds.length > 0) {
  const { data: assignedRaw } = await adminSupabase
    .from('recruitment_session_slots')
    .select('id, starts_at, ends_at, recruitment_sessions(title)')
    .in('id', assignedSlotIds);

  for (const row of (assignedRaw ?? []) as unknown as Array<{
    id: string; starts_at: string; ends_at: string; recruitment_sessions: { title: string } | null;
  }>) {
    assignedSlots[row.id] = {
      title: row.recruitment_sessions?.title ?? 'Session supprimée',
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    };
  }
}
```

et l'affichage correspondant :

```astro
          {s.slot_id && (
            <div class="assigned-note">
              ✅ Affecté à : {assignedSlots[s.slot_id]
                ? `${assignedSlots[s.slot_id].title} (${formatDateTimeLong(assignedSlots[s.slot_id].starts_at)} – ${toHHmm(assignedSlots[s.slot_id].ends_at)})`
                : 'créneau supprimé'}
            </div>
          )}
```

Importer `toHHmm` depuis `@/lib/dateHelpers`.

- [ ] **Step 3 : Vérifier dans le navigateur**

Run: `npm run dev` puis ouvrir `/dashboard/admin/candidatures` et `/dashboard/admin/candidatures/sessions/<id>` en tant qu'admin.
Expected: la fiche liste les créneaux avec leurs inscrits ; l'affectation d'un candidat à un créneau précis fonctionne et le compteur du créneau s'incrémente ; affecter à un créneau plein renvoie une erreur 409 affichée en toast.

- [ ] **Step 4 : Commit**

```bash
git add src/pages/dashboard/admin/candidatures.astro src/pages/dashboard/admin/candidatures/sessions/[id].astro
git commit -m "feat(admin): affectation et suivi des candidats par creneau"
```

---

### Task 10 : Page publique et formulaire de candidature

**Files:**
- Modify: `src/pages/rejoignez-nous.astro`
- Modify: `src/components/react/RecruitmentFormClient.tsx`

**Interfaces:**
- Consumes : `GET /api/recruitment/sessions` (Task 6), `POST /api/recruitment` avec `slot_id` (Task 6).

- [ ] **Step 1 : Charger sessions et créneaux dans la page**

Dans `src/pages/rejoignez-nous.astro`, remplacer le chargement par :

```ts
const now = new Date().toISOString();
const admin = createSupabaseAdminClient();

const { data: sessionRows, error: sessionsError } = await admin
  .from('recruitment_sessions')
  .select(PUBLIC_SESSION_COLUMNS)
  .eq('status', 'open');

if (sessionsError) {
  console.error('[rejoignez-nous] erreur sessions:', sessionsError.message, sessionsError.details);
}

const openSessions = (sessionRows ?? []) as unknown as RecruitmentSession[];

const { data: slotRows, error: slotsError } = openSessions.length
  ? await admin
      .from('recruitment_session_slots')
      .select(PUBLIC_SLOT_COLUMNS)
      .in('session_id', openSessions.map((s) => s.id))
      .gt('starts_at', now)
      .order('starts_at', { ascending: true })
  : { data: [], error: null };

if (slotsError) {
  console.error('[rejoignez-nous] erreur creneaux:', slotsError.message);
}

const slots = (slotRows ?? []) as unknown as RecruitmentSessionSlot[];
const slotCounts = await countActiveCandidatesBySlot(slots.map((s) => s.id));
const slotsWithStats = withSlotStats(slots, slotCounts);

const sessionsWithSlots = openSessions
  .map((session) => ({
    ...session,
    slots: slotsWithStats.filter((slot) => slot.session_id === session.id),
  }))
  .filter((session) => session.slots.length > 0);

const hasSessions = sessionsWithSlots.length > 0;
```

Adapter les imports : `PUBLIC_SESSION_COLUMNS`, `PUBLIC_SLOT_COLUMNS`, `countActiveCandidatesBySlot`, `withSlotStats`.

- [ ] **Step 2 : Afficher un bloc par session, une ligne par créneau**

Remplacer le contenu de `<ul class="recruit-sessions__list">` par :

```astro
          <ul class="recruit-sessions__list">
            {sessionsWithSlots.map((session) => (
              <li class="recruit-sessions__card" data-session-id={session.id}>
                <div class="recruit-sessions__main">
                  <div class="recruit-sessions__title">{session.title}</div>
                  {session.description && <p class="recruit-sessions__desc">{session.description}</p>}
                </div>
                <ul class="recruit-slots">
                  {session.slots.map((slot) => {
                    const full = slot.places_remaining === 0;
                    return (
                      <li class={`recruit-slots__row ${full ? 'recruit-slots__row--full' : ''}`}>
                        <span class="recruit-slots__when">
                          {formatDateTimeLong(slot.starts_at)} – {toHHmm(slot.ends_at)}
                          {slot.location && ` · ${slot.location}`}
                        </span>
                        <span class={`recruit-sessions__badge ${full ? 'recruit-sessions__badge--full' : ''}`}>
                          {full ? 'Complet' : `${slot.places_remaining} place${slot.places_remaining > 1 ? 's' : ''}`}
                        </span>
                        <button
                          type="button"
                          class="btn-primary btn-sm js-apply"
                          data-slot-id={slot.id}
                          data-slot-label={`${session.title} — ${formatDateTimeLong(slot.starts_at)}`}
                          disabled={full}
                        >
                          {full ? 'Complet' : 'Candidater'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
```

Ajouter au `<style>` de la page, sans modifier les règles existantes :

```css
  .recruit-slots { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .recruit-slots__row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .recruit-slots__when { flex: 1 1 auto; font-size: var(--text-sm); }
  .recruit-slots__row--full .recruit-slots__when { opacity: 0.6; }
```

Dans le `<script nonce={Astro.locals.nonce}>` de la page, remplacer le corps du gestionnaire de clic par sa version créneau. Le mécanisme d'événement reste indispensable : écrire `radio.checked` sur un champ contrôlé par React ne met pas à jour l'état du formulaire.

```js
  applyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isAuthRequired) {
        window.location.href = AUTH_REDIRECT;
        return;
      }

      const slotId = btn.getAttribute('data-slot-id');
      const slotLabel = btn.getAttribute('data-slot-label') || 'Créneau sélectionné';
      if (!slotId || !modal || !modalSession) return;

      if (modalTitle) modalTitle.textContent = 'Candidater à ce créneau';
      modalSession.textContent = slotLabel;

      // Le formulaire de la modale est un ilot React : ecrire `radio.checked`
      // directement ne mettait pas a jour son etat interne, donc la candidature
      // partait SANS creneau, et React ecrasait la coche au premier rendu.
      // On notifie l'ilot ('modal' = son idPrefix), lui seul reagit.
      window.dispatchEvent(new CustomEvent('recruitment:preselect-slot', {
        detail: { target: 'modal', slotId: slotId },
      }));

      if (modal instanceof HTMLDialogElement) {
        modal.showModal();
      }
    });
  });
```

Côté React, l'écouteur correspondant (`PRESELECT_SESSION_EVENT` dans `RecruitmentFormClient.tsx`) est renommé en conséquence à l'étape suivante : la constante devient `const PRESELECT_SLOT_EVENT = 'recruitment:preselect-slot';` et le handler écrit `setFormData((current) => ({ ...current, slot_id: detail.slotId }))`.

Importer `toHHmm` depuis `@/lib/dateHelpers`.

- [ ] **Step 3 : Basculer l'îlot React sur les créneaux**

Dans `src/components/react/RecruitmentFormClient.tsx` :

1. Remplacer le type de session local par :

```tsx
interface SessionSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  places_remaining: number;
}

interface SessionWithSlots {
  id: string;
  title: string;
  slots: SessionSlot[];
}
```

2. Renommer le champ `session_id` du state en `slot_id` (déclaration du type de formulaire, `buildInitialData`, `INITIAL_FORM_DATA`, garde `if (name === 'slot_id' && !isAuthenticated) return;`, corps envoyé à l'API et lecture de `payload.errors.slot_id`), et renommer la prop `preselectedSessionId` en `preselectedSlotId`.

3. Remplacer le rendu de la liste par un groupe par session :

```tsx
              {sessions.map((session) => (
                <fieldset key={session.id} className="session-group">
                  <legend className="session-group__title">{session.title}</legend>
                  {session.slots.map((slot) => {
                    const full = slot.places_remaining === 0;
                    return (
                      <label
                        key={slot.id}
                        className={`session-option ${formData.slot_id === slot.id ? 'session-option--selected' : ''} ${full ? 'session-option--full' : ''}`}
                      >
                        <input
                          type="radio"
                          name="slot_id"
                          value={slot.id}
                          checked={formData.slot_id === slot.id}
                          onChange={handleInputChange}
                          disabled={full || !isAuthenticated}
                        />
                        <span className="session-option__meta">
                          {slotDateFmt.format(new Date(slot.starts_at))} – {slotTimeFmt.format(new Date(slot.ends_at))}
                          {slot.location && ` · ${slot.location}`}
                        </span>
                        <span className={`session-option__badge ${full ? 'session-option__badge--full' : ''}`}>
                          {full ? 'Complet' : `${slot.places_remaining} place${slot.places_remaining > 1 ? 's' : ''}`}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
```

4. Déclarer les deux formateurs, tous deux calés sur l'heure de Paris :

```tsx
const slotDateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
const slotTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit',
});
```

5. Dans `src/components/Recruitmentform.astro`, renommer la prop `preselectedSessionId` en `preselectedSlotId` et la transmettre au composant React.

6. Ajouter à `src/styles/recruitment-form.css` :

```css
.session-group { border: none; margin: 0; padding: 0 0 8px; display: flex; flex-direction: column; gap: 6px; }
.session-group__title { font-weight: 600; padding: 0; }
```

- [ ] **Step 4 : Vérifier bout en bout**

Run: `npx astro check`
Expected: aucune erreur.

Run: `npm run dev` puis ouvrir `/rejoignez-nous`.
Expected: chaque session affiche ses créneaux ; un créneau complet est marqué « Complet » et son bouton radio est désactivé ; « Candidater » sur un créneau le présélectionne dans le formulaire ; une candidature connectée aboutit et décrémente les places du bon créneau.

- [ ] **Step 5 : Commit**

```bash
git add src/pages/rejoignez-nous.astro src/components/react/RecruitmentFormClient.tsx src/components/Recruitmentform.astro src/styles/recruitment-form.css
git commit -m "feat(rejoignez-nous): choix du creneau par le candidat"
```

---

### Task 11 : Test e2e et vérification finale

**Files:**
- Create: `tests/e2e/recruitment-slots.spec.ts`

**Interfaces:**
- Consumes : la page `/rejoignez-nous` (Task 10) et l'API publique (Task 6).

- [ ] **Step 1 : Écrire le test e2e**

Créer `tests/e2e/recruitment-slots.spec.ts` :

```ts
import { test, expect } from '@playwright/test';

test.describe('Créneaux de recrutement', () => {
  test('la page publique répond et expose la section sessions', async ({ page }) => {
    const response = await page.goto('/rejoignez-nous');
    expect(response?.status()).toBe(200);
    await expect(page.locator('#sessions')).toBeVisible();
  });

  test('chaque créneau affiché porte un horaire et un état de places', async ({ page, request }) => {
    const api = await request.get('/api/recruitment/sessions');
    expect(api.status()).toBe(200);
    const sessions = await api.json();

    await page.goto('/rejoignez-nous');

    if (sessions.length === 0) {
      await expect(page.getByText(/Aucune session de recrutement/)).toBeVisible();
      return;
    }

    const rows = page.locator('.recruit-slots__row');
    const expected = sessions.reduce((sum: number, s: { slots: unknown[] }) => sum + s.slots.length, 0);
    await expect(rows).toHaveCount(expected);

    // Un creneau complet ne doit pas etre candidatable.
    const fullRows = page.locator('.recruit-slots__row--full');
    for (let i = 0; i < (await fullRows.count()); i++) {
      await expect(fullRows.nth(i).getByRole('button', { name: 'Complet' })).toBeDisabled();
    }
  });
});
```

- [ ] **Step 2 : Lancer le test**

Run: `npm run test:e2e -- recruitment-slots`
Expected: les deux tests passent.

- [ ] **Step 3 : Vérification complète**

Run: `npx astro check && npm run lint && npm run build && npm run verify:slots`
Expected: aucune erreur de type, aucune erreur de lint, build complet, `TOUT PASSE` sur les vérifications base.

- [ ] **Step 4 : Contrôle manuel de bout en bout**

Sur `npm run dev`, en tant qu'admin :
1. créer une session à deux créneaux, dont un à 1 place ;
2. vérifier sur `/rejoignez-nous` que les deux créneaux s'affichent avec le bon horaire de Paris ;
3. candidater sur le créneau à 1 place depuis un compte connecté ;
4. recharger : le créneau affiche « Complet », son bouton est désactivé ;
5. depuis `/dashboard/admin/candidatures`, tenter d'affecter un second candidat à ce créneau — le refus 409 doit s'afficher en toast ;
6. depuis la fiche session, tenter de supprimer le créneau occupé via l'édition des créneaux — le refus 409 doit s'afficher.

- [ ] **Step 5 : Commit**

```bash
git add tests/e2e/recruitment-slots.spec.ts
git commit -m "test(e2e): affichage et disponibilite des creneaux de recrutement"
```

---

## Notes d'exécution

- **Ordre imposé.** Les Tasks 1 et 2 doivent être appliquées en base avant toute tâche de code : les colonnes supprimées font échouer le typage et les requêtes tant que la migration n'est pas passée.
- **Entre la Task 3 et la Task 10, `npx astro check` échoue par construction.** Les erreurs restantes sont la liste des fichiers non encore repris ; elles doivent avoir disparu à la fin de la Task 10.
- **Migration irréversible.** Les Tasks 1 et 2 suppriment des colonnes. Prendre une sauvegarde de la base avant `supabase db push` (Supabase : *Database → Backups*).
