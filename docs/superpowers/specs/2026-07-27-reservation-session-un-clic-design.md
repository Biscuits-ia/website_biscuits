# Réservation d'une place de session en un clic

Date : 2026-07-27
Statut : validé, prêt pour implémentation

## Problème

Une session de recrutement est un rendez-vous collectif à places limitées, pas un
poste à pourvoir. La page `/rejoignez-nous` la traite pourtant comme une offre
d'emploi : le bouton de chaque carte dit « Candidater » et ouvre une modale
contenant le formulaire de candidature complet — prénom, nom, e-mail,
compétences, disponibilité, motivation.

Deux conséquences :

1. **Le mot est faux.** On ne candidate pas à une session, on y réserve une
   place. Le vocabulaire de la page ne correspond pas à ce que fait le bouton.
2. **Un membre connecté re-saisit ce que le site sait déjà.** Son e-mail est
   imposé par son compte et le champ est verrouillé, mais il doit malgré tout
   retaper son identité et remplir un formulaire de six champs pour prendre une
   place.

S'y ajoute un défaut de conception : la session peut être choisie par **deux**
chemins concurrents — le bouton de la carte et le radiogroup du formulaire en bas
de page. C'est cette dualité qui a produit le bug du 26/07, où le bouton écrivait
`radio.checked` sur un champ contrôlé par React sans mettre à jour son état, et
envoyait donc une candidature spontanée à la place de la session demandée.

## Décisions

1. **Réserver n'est pas candidater.** Le membre connecté pose sa place en un
   clic, sans formulaire. Le formulaire long ne sert plus qu'à la candidature
   spontanée.
2. **Une place par compte.** Règle déjà en base ; elle devient visible dans
   l'interface au lieu de se manifester par un message d'erreur.
3. **Un seul chemin vers une session.** Le radiogroup de sessions disparaît du
   formulaire ; seules les cartes réservent.

## Modèle de données

**Aucune migration.** Tout l'appui existe déjà :

| Existant | Rôle ici |
|---|---|
| `recruitment_submissions.session_id` | Porte la réservation |
| `recruitment_submissions.user_id` (20260726160000) | Rattache la candidature au compte |
| `uniq_recruitment_submission_per_user` | Garantit « une place par compte » |
| `check_recruitment_session_capacity` (20260726140000) | Sérialise le plafond, `FOR UPDATE` |
| Policy `recruitment_own_select` | Laisse le membre relire sa propre candidature |

Réserver = poser `session_id`. Annuler = le remettre à `NULL` — la candidature
survit, la place est rendue. C'est exactement la sémantique de
`POST /api/admin/candidatures/unassign`.

## API

### `src/pages/api/recruitment/reserve.ts` (nouveau)

| Méthode | Effet |
|---|---|
| `POST` | Réserve ou déplace. Corps : `{ session_id, first_name?, last_name? }` |
| `DELETE` | Annule : `session_id = NULL` |

Déroulé du `POST` :

1. **Rate-limit IP** — `rateLimitRoute(ip, '/api/recruitment/reserve', 10, 10 min)`.
   Plus permissif que `/api/recruitment` (5) : réserver, changer d'avis et
   annuler sont des gestes normaux et répétés.
2. **Authentification** — `getUser()`, jamais `getSession()` : le cookie est sous
   le contrôle du client, seul l'appel au serveur Auth est non forgeable. 401
   sans compte. L'e-mail enregistré est **toujours** celui du compte ; le corps
   de la requête ne peut pas l'influencer.
3. **Identité**, dans cet ordre :
   - candidature existante du compte → son `first_name` / `last_name` ;
   - sinon `profiles.full_name` → premier mot = prénom, reste = nom ;
   - sinon `first_name` / `last_name` du corps, qui sont alors recopiés dans
     `profiles.full_name` pour ne demander qu'une fois ;
   - si aucun des trois → `422 { needs_name: true }`, signal qui déclenche la
     mini-modale côté client.
4. **Validation de la session** — `status = 'open'` et `scheduled_at` futur.
   Le comptage des places **exclut la ligne du demandeur** : sans cela, un
   membre déjà inscrit à une session complète ne pourrait pas la re-confirmer,
   et un déplacement compterait sa propre place deux fois.
5. **Écriture** — `UPDATE` si le compte a déjà une candidature, `INSERT` sinon.
   Un `23505` (course entre deux `INSERT` concurrents du même compte) retombe
   sur l'`UPDATE` plutôt que de remonter une erreur : ce n'est pas une panne.
6. **E-mail** — `notifySessionAssigned`, déjà utilisé par l'affectation admin.
   `DELETE` envoie `notifySessionUnassigned`. Un échec d'envoi est journalisé,
   jamais propagé : la place est prise, c'est ce qui compte.

Le trigger de capacité reste l'autorité en cas de réservations simultanées ; le
comptage applicatif n'est qu'un filtre d'ergonomie. Une violation du trigger est
traduite en `409`.

### `POST /api/recruitment` (inchangé)

Garde son rejet de `session_id` sans compte connecté. Le client ne l'envoie plus,
mais la règle reste : le formulaire n'est pas l'autorité.

## Écrans

### Page publique `/rejoignez-nous`

Le rendu serveur lit la réservation du membre (`user_id` → `id, session_id`) et
l'état de chaque carte en découle :

| Situation | Bouton |
|---|---|
| Non connecté | `Réserver ma place` → `/connexion?redirect=/rejoignez-nous&message=reserver` |
| Connecté, aucune réservation | `Réserver ma place` |
| Réservé sur cette session | Badge `✅ Place réservée` + `Annuler` |
| Réservé sur une autre session | `Réserver ma place`, précédé d'une confirmation « Vous êtes inscrit à *A*. Passer à celle-ci ? » |
| Session complète | `Complet`, désactivé |

La `<dialog>` existante perd le formulaire complet et devient la mini-modale de
saisie du nom (deux champs), ouverte uniquement sur `needs_name`. Le script reste
en vanilla avec `nonce`, comme l'actuel : pas de nouvel îlot React pour trois
boutons.

### Formulaire du bas

Devient franchement « Candidature spontanée ». Disparaissent de
`RecruitmentFormClient` : le radiogroup de sessions, son verrou 🔒 pour les
visiteurs, le `fetch` de `/api/recruitment/sessions` qui l'alimentait, et le
`CustomEvent` de présélection mis en place le 26/07 — le contournement n'a plus
d'objet une fois le double chemin supprimé.

### Libellés

« Candidater » → « Réserver » partout où le mot vise une session : cartes,
modale, `connexion.astro` (`?message=candidater` → `reserver`, l'ancienne valeur
restant acceptée pour ne pas casser les liens déjà envoyés), message 401 de
`/api/recruitment`. Le mot reste sur `/piliers` et dans la FAQ, qui parlent bien
de candidature.

Aucune refonte visuelle : les classes et styles existants sont conservés.

## Fichiers impactés

- `src/pages/api/recruitment/reserve.ts` (nouveau)
- `src/lib/recruitmentSessions.ts` — helper de lecture de la réservation du membre
- `src/pages/rejoignez-nous.astro`
- `src/components/react/RecruitmentFormClient.tsx`
- `src/pages/connexion.astro`
- `src/pages/api/recruitment.ts` (libellé du 401)

## Vérification

1. **Anonyme** — `tests/e2e/recruitment-reservation.spec.ts`, 4 cas : la page
   répond 200 ; aucun bouton de session ne dit « Candidater » ; une carte
   propose « Réserver ma place » et une carte pleine est `disabled` ; le
   radiogroup de sessions a disparu du formulaire ; un visiteur non connecté
   est envoyé vers `/connexion?message=reserver`.

2. **Connecté** — `tests/e2e/recruitment-reservation-auth.spec.ts`, 3 cas :
   réserver pose la place, réserver ailleurs la **déplace** (toujours une seule
   ligne), annuler rend la place **sans** supprimer la candidature. Chaque cas
   compare l'écran ET l'état réel en base.

   Ces tests écrivent dans la base pointée par `.env.local`. Ils sont donc
   ignorés par défaut et n'ont lieu qu'avec :

   ```
   E2E_AUTH=1 npx playwright test tests/e2e/recruitment-reservation-auth.spec.ts
   ```

   Ils fabriquent leur propre compte et leurs propres sessions, ne touchent
   aucune session réelle, et purgent tout en sortie — y compris les lignes
   `email_outbox`, que la cascade n'emporte pas et qu'un cron aurait envoyées.

3. **Capacité** — non couvert automatiquement : deux réservations concurrentes
   sur la dernière place, une seule doit réussir, l'autre recevoir un `409`.
   C'est la règle qui a déjà cédé deux fois ; elle mérite une preuve SQL
   reproductible, hors périmètre de Playwright.

## Hors périmètre

- La refonte en créneaux multiples
  (`2026-07-27-recruitment-session-slots-design.md`), qui remplacera `session_id`
  par `slot_id`. Le présent travail garde volontairement `session_id` : les deux
  specs se composent, la seconde renommera la colonne dans une route déjà écrite.
- Le HTTP 500 de production sur `/rejoignez-nous`, déjà identifié dans la spec
  créneaux et à corriger avant tout déploiement de cette page.
