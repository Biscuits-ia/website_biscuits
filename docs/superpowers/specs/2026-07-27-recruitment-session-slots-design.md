# Créneaux horaires multiples sur les sessions de recrutement

Date : 2026-07-27
Statut : validé, prêt pour plan d'implémentation

## Problème

Une session de recrutement ne peut aujourd'hui décrire qu'un seul rendez-vous :
`recruitment_sessions` porte `scheduled_at` + `duration_minutes`, soit un instant
et une durée. L'admin ne peut donc ni saisir une heure de fin explicite, ni
proposer plusieurs horaires pour une même campagne de recrutement. Chaque
horaire supplémentaire l'oblige à créer une session distincte, ce qui duplique
titre, description et lieu, et éclate le suivi des candidatures.

## Décisions

Trois choix cadrent la solution :

1. **Le candidat choisit un seul créneau.** Une session regroupe plusieurs
   horaires alternatifs, pas un parcours en plusieurs séances. Une candidature
   est rattachée à exactement un créneau.
2. **La capacité est portée par le créneau, pas par la session.** Il n'y a pas
   de plafond global au niveau de la session : une seule règle, un seul endroit
   où elle s'applique.
3. **Le lieu est porté par le créneau.** Une même session peut ainsi mêler une
   séance en visio et une séance en salle.

Approche retenue : une table dédiée `recruitment_session_slots`, la candidature
pointant sur le créneau (`slot_id`) et non plus sur la session.

Deux alternatives ont été écartées :

- **Conserver `session_id` en plus de `slot_id`** aurait limité le nombre de
  fichiers à reprendre, au prix de deux colonnes devant rester cohérentes sans
  que la base puisse le garantir simplement. C'est la classe d'incohérence à
  l'origine des correctifs d'affectation du 26/07.
- **Stocker les créneaux en JSONB** sur `recruitment_sessions` aurait évité la
  jointure, mais supprimé la clé étrangère depuis la candidature, le trigger de
  capacité et l'index sur la date. La capacité ne serait plus vérifiable qu'au
  niveau applicatif, donc plus garantie en cas de soumissions simultanées.

## Modèle de données

### Nouvelle table

```sql
CREATE TABLE public.recruitment_session_slots (
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

CREATE INDEX idx_recruitment_session_slots_session ON public.recruitment_session_slots (session_id, starts_at);
CREATE INDEX idx_recruitment_session_slots_starts  ON public.recruitment_session_slots (starts_at);
```

`ON DELETE CASCADE` : supprimer une session supprime ses créneaux. La règle
métier « on ne supprime pas ce à quoi des candidats sont rattachés » est
appliquée en amont, dans l'API, comme aujourd'hui pour les sessions.

Trigger `set_updated_at` sur la table, comme les autres tables du schéma.

### Colonnes déplacées

`recruitment_sessions` perd `scheduled_at`, `duration_minutes`, `location` et
`max_candidates`. Elle conserve `id`, `title`, `description`, `status`,
`created_by`, `created_at`, `updated_at`.

`recruitment_submissions.session_id` est remplacé par :

```sql
ALTER TABLE public.recruitment_submissions
  ADD COLUMN slot_id uuid REFERENCES public.recruitment_session_slots(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL` conserve le comportement actuel : si le créneau disparaît,
la candidature subsiste et redevient spontanée. On préfère perdre l'affectation
que la candidature.

### Migration des données

En une transaction, avant toute suppression de colonne :

1. Pour chaque session existante, créer un créneau :
   `starts_at = scheduled_at`,
   `ends_at = scheduled_at + (duration_minutes || ' minutes')::interval`,
   `location` et `max_candidates` recopiés.
2. `UPDATE recruitment_submissions SET slot_id = <créneau de sa session>`
   pour toute candidature dont `session_id` n'est pas NULL.
3. `ALTER TABLE recruitment_submissions DROP COLUMN session_id;`
4. `ALTER TABLE recruitment_sessions DROP COLUMN scheduled_at, duration_minutes,
   location, max_candidates;`

La session existante du 1er août 2026 et sa candidature éventuelle sont reprises
sans perte.

### Capacité

Le trigger `check_recruitment_session_capacity` devient
`check_recruitment_slot_capacity`, monté sur :

```sql
CREATE TRIGGER trg_recruitment_submissions_capacity
  BEFORE INSERT OR UPDATE OF slot_id ON public.recruitment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.check_recruitment_slot_capacity();
```

La clause `OF slot_id` est indispensable : laissée sur `session_id`, colonne
supprimée, le trigger ne se déclencherait plus et le plafond deviendrait
décoratif.

Corps de la fonction, transposé de la version corrigée le 26/07 :

- sortie immédiate si `NEW.slot_id IS NULL` (désaffectation) ;
- sortie immédiate en `UPDATE` si `slot_id` n'a pas changé ;
- `SELECT s.max_candidates, ses.status INTO v_max, v_status
   FROM recruitment_session_slots s
   JOIN recruitment_sessions ses ON ses.id = s.session_id
   WHERE s.id = NEW.slot_id FOR UPDATE OF s;`
  — deux colonnes projetées, **deux** variables cibles (le bug d'origine était
  précisément un `INTO` à une seule variable) ;
- erreur si le créneau est introuvable, si la session parente n'est pas `open`,
  ou si le nombre de candidatures non `declined` sur ce créneau atteint déjà
  `max_candidates` ;
- `ERRCODE` explicites, repris de la version actuelle.

Le `FOR UPDATE` sérialise réellement les affectations concurrentes : en
`READ COMMITTED`, un `COUNT(*)` seul ne garantit rien.

### RLS et grants

```sql
ALTER TABLE public.recruitment_session_slots ENABLE ROW LEVEL SECURITY;

-- Lecture publique des créneaux d'une session ouverte
CREATE POLICY "recruitment_slots_public_read"
  ON public.recruitment_session_slots FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.recruitment_sessions s
                 WHERE s.id = session_id AND s.status = 'open'));

-- Lecture complète + écriture pour admin/moderator
CREATE POLICY "recruitment_slots_admin_read"   ON ... FOR SELECT USING (public.get_my_role() IN ('admin','moderator'));
CREATE POLICY "recruitment_slots_admin_insert" ON ... FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','moderator'));
CREATE POLICY "recruitment_slots_admin_update" ON ... FOR UPDATE USING (...) WITH CHECK (...);
CREATE POLICY "recruitment_slots_admin_delete" ON ... FOR DELETE USING (...);

GRANT SELECT ON public.recruitment_session_slots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.recruitment_session_slots TO authenticated;
```

Le rôle de l'appelant est résolu par `public.get_my_role()` (SECURITY DEFINER,
lit le JWT), jamais par une sous-requête sur `profiles`. Une policy `FOR ALL`
s'appliquerait aussi au `SELECT` et importerait dans chaque lecture les
dépendances de `profiles` — c'est le mécanisme qui a produit le
`permission denied for table project_members` corrigé par la migration
`20260727150000_fix_recruitment_sessions_public_read.sql`.

La policy de lecture publique interroge `recruitment_sessions`, dont les
policies de lecture ne dépendent plus de `profiles` après cette même migration :
la chaîne reste donc évaluable par `anon`.

### Atomicité création / édition

Le client Supabase ne sait pas grouper deux `insert` dans une transaction. Une
session créée sans créneau serait invisible côté public et incohérente côté
admin. Deux fonctions Postgres, `SECURITY DEFINER`, contrôlant le rôle appelant
via `get_my_role()` :

- `public.create_recruitment_session_with_slots(p_title text, p_description text,
  p_status text, p_created_by uuid, p_slots jsonb) RETURNS uuid`
  — insère la session puis ses créneaux ; échoue si `p_slots` est vide.
- `public.replace_recruitment_session_slots(p_session_id uuid, p_slots jsonb) RETURNS void`
  — remplace la liste des créneaux ; **lève une exception** si un créneau à
  supprimer porte encore des candidatures non `declined` (traduit en HTTP 409
  par l'API) ; échoue si la liste résultante est vide.

Chaque entrée de `p_slots` : `{ starts_at, ends_at, location, max_candidates }`.

## API

### Admin

| Route | Changement |
|---|---|
| `POST /api/admin/recruitment-sessions` | Corps : `{ title, description, status, slots: [{ starts_at, ends_at, location, max_candidates }] }`. Au moins un créneau, sinon 422. Appelle `create_recruitment_session_with_slots`. |
| `GET /api/admin/recruitment-sessions` | Retourne les sessions avec leurs créneaux et, par créneau, `candidate_count` et `places_remaining`. |
| `PATCH /api/admin/recruitment-sessions/[id]` | Ne modifie plus que `title`, `description`, `status`. |
| `PUT /api/admin/recruitment-sessions/[id]/slots` | Nouvelle route. Remplace la liste des créneaux via `replace_recruitment_session_slots`. 409 si un créneau supprimé porte des candidatures. |
| `DELETE /api/admin/recruitment-sessions/[id]` | Inchangé dans son principe : refus (409) tant qu'une candidature est rattachée à un créneau de la session. |
| `POST /api/admin/recruitment-sessions/[id]/assign` | Le corps porte désormais le créneau cible : `{ submission_id, slot_id }`. Le créneau doit appartenir à la session `[id]`, sinon 422. |
| `POST /api/admin/candidatures/unassign` | Écrit `slot_id = null` au lieu de `session_id = null`. |

Validation serveur des créneaux, à chaque écriture : `starts_at` et `ends_at`
parsables, `ends_at > starts_at`, `max_candidates` entre 1 et 100, `location`
≤ 300 caractères. Bornes reprises de la validation actuelle.

### Public

| Route | Changement |
|---|---|
| `GET /api/recruitment/sessions` | Retourne les sessions `open` ayant au moins un créneau à venir, chacune avec ses créneaux à venir (`id`, `starts_at`, `ends_at`, `location`, `max_candidates`, `places_remaining`). Colonnes exposées listées explicitement, jamais `select('*')`. |
| `POST /api/recruitment` | Le corps porte `slot_id` au lieu de `session_id`. Règle inchangée : choisir un créneau exige un compte connecté (401 sinon), l'e-mail est imposé par le compte, la candidature est rattachée via `user_id`. |

Le comptage des candidatures actives passe par le client service_role
(`src/lib/recruitmentSessions.ts`), comme aujourd'hui : la policy
`recruitment_admin_select` réserve la lecture de `recruitment_submissions` aux
admins, et un comptage fait avec la clé visiteur renverrait zéro sans erreur.
Seuls des agrégats sortent de ce module.

### E-mails

`src/lib/recruitmentMail.ts` tire date, horaires et lieu du créneau. Le corps du
message affiche début et fin (« le samedi 1er août 2026, de 14:00 à 16:00 »)
plutôt qu'une date et une durée.

## Écrans

Aucune refonte visuelle : uniquement les champs et colonnes qu'impose le nouveau
modèle, dans les composants et styles existants.

### Modale « Nouvelle session » — `/dashboard/admin/candidatures/sessions`

Titre et description en haut, puis une liste répétable de créneaux. Chaque ligne
comporte : date, heure de début, heure de fin, places, lieu. Bouton
« + Ajouter un créneau », bouton de retrait par ligne, minimum une ligne
(le retrait est désactivé quand il ne reste qu'un créneau).

Trois champs (date / début / fin) plutôt que deux `datetime-local` : la date ne
se saisit qu'une fois et un créneau à cheval sur minuit n'a pas de sens ici. Les
deux bornes sont converties en instants UTC via `parisIsoFromLocalInput`, déjà
présent dans la page — la saisie est toujours interprétée comme une heure de
Paris, quel que soit le fuseau du navigateur de l'admin.

Le verrou anti double-soumission existant sur le bouton « Créer » est conservé.

### Liste des sessions

Colonne *Date* : « 3 créneaux · 1er → 5 sept. » (un seul créneau : l'horaire tel
quel). Colonne *Inscrits* : cumul inscrits / places tous créneaux confondus. Le
détail par créneau est sur la fiche.

### Fiche session — `/dashboard/admin/candidatures/sessions/[id]`

Tableau des créneaux : horaires, lieu, inscrits / places, candidats rattachés.
L'affectation d'un candidat vise un créneau. Le sélecteur d'affectation liste
les créneaux non pleins de la session.

### Page publique — `/rejoignez-nous`

Chaque session affiche ses créneaux à venir, un bouton radio par créneau, avec
un badge « N places » ou « Complet » par ligne. Un créneau complet n'est pas
sélectionnable. Une session dont tous les créneaux sont pleins ou passés
disparaît de la liste ; si aucune session n'a de créneau disponible, le message
de candidature spontanée s'affiche, comme aujourd'hui.

`RecruitmentFormClient` passe de `session_id` à `slot_id`, les options étant
groupées par session. La préselection depuis un bouton « Candidater » continue
de passer par le `CustomEvent` mis en place le 26/07 — écrire `radio.checked`
sur un champ contrôlé par React ne met pas à jour l'état du formulaire.

## Fichiers impactés

Migrations (nouvelles) :
- `supabase/migrations/20260727160000_recruitment_session_slots.sql` — table,
  index, RLS, grants, trigger de capacité, migration des données, suppression
  des colonnes.
- `supabase/migrations/20260727161000_recruitment_session_slot_rpc.sql` — les
  deux fonctions d'écriture atomique.

Ces deux migrations s'appliquent après
`20260727150000_fix_recruitment_sessions_public_read.sql`, dont elles supposent
les policies de lecture.

Code :
- `src/types/recruitment.ts`
- `src/lib/recruitmentSessions.ts`
- `src/lib/recruitmentMail.ts`
- `src/pages/api/recruitment.ts`
- `src/pages/api/recruitment/sessions.ts`
- `src/pages/api/admin/recruitment-sessions/index.ts`
- `src/pages/api/admin/recruitment-sessions/[id].ts`
- `src/pages/api/admin/recruitment-sessions/[id]/slots.ts` (nouveau)
- `src/pages/api/admin/recruitment-sessions/[id]/assign.ts`
- `src/pages/api/admin/candidatures/unassign.ts`
- `src/pages/dashboard/admin/candidatures.astro`
- `src/pages/dashboard/admin/candidatures/sessions.astro`
- `src/pages/dashboard/admin/candidatures/sessions/[id].astro`
- `src/pages/rejoignez-nous.astro`
- `src/components/react/RecruitmentFormClient.tsx`

## Vérification

Le dépôt n'a que Playwright (`tests/e2e`), pas de socle de tests unitaires.

1. **Test e2e** sur `/rejoignez-nous` : les créneaux d'une session ouverte
   s'affichent ; un créneau plein porte le badge « Complet » et son bouton radio
   est désactivé.
2. **Vérification SQL du trigger de capacité** : deux transactions concurrentes
   affectant un candidat au dernier créneau libre ; une seule doit réussir,
   l'autre doit échouer avec l'`ERRCODE` de capacité. C'est la règle qui a déjà
   cédé deux fois ; elle mérite une preuve reproductible plutôt qu'un contrôle
   manuel.
3. **Contrôle manuel** du bout en bout : création d'une session à deux créneaux
   depuis la modale, vérification des horaires en base (heure de Paris
   correctement convertie), candidature sur un créneau, affichage des places
   restantes.

## Hors périmètre

Deux problèmes constatés le 27/07 sont volontairement traités à part :

- **`/rejoignez-nous` renvoie HTTP 500 en production.** Toutes les autres pages
  testées répondent 200 et `/api/recruitment/sessions` renvoie correctement la
  session : le crash est dans le rendu de la page. La cause exacte demande les
  logs d'exécution Vercel, inaccessibles depuis cette session (403 sur le projet
  `prj_Fdx5R5TPJ01mrQpci6I64XtagpLw`). À corriger avant de déployer cette
  refonte, qui porte sur la même page.
- **La lecture de `public.profiles` par le rôle `anon` reste cassée**
  (`permission denied for table project_members`, via la policy
  `profiles_project_member_read`). La migration
  `20260727150000_fix_recruitment_sessions_public_read.sql` débloque
  `recruitment_sessions` sans toucher à `profiles` ; le cas `profiles` demande
  sa propre correction.
