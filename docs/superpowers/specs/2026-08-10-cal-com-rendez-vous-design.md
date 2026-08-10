# Design — Page /rendez-vous (Cal.com, lien externe)

Date : 2026-08-10
Statut : validé en brainstorming, en attente de l'URL Cal.com définitive

## Objectif

Offrir aux visiteurs publics (associations, collectivités, TPE/PME, citoyens) un
moyen de réserver un rendez-vous de découverte avec Biscuits IA, sans passer par
le formulaire de contact écrit.

## Périmètre

Dans le périmètre :

- Nouvelle page publique `/rendez-vous`
- Entrée dans le header et le footer
- Liens contextuels depuis `/contact` et `/services`
- Règle de cache dans `vercel.json`

Hors périmètre, volontairement :

- Embed Cal.com (iframe / script tiers) — voir « Alternatives écartées »
- API Cal.com v2, réservation côté serveur
- Rendez-vous pour Anti Pepins, ou depuis l'espace connecté
- Toute modification du formulaire de contact existant

## Approche retenue

Page maison hébergée sur le site, avec un lien sortant vers la page de
réservation Cal.com. Aucun code Cal.com n'est chargé dans le navigateur.

Conséquence directe : aucun script tiers, aucun cookie tiers, aucune modification
de la Content-Security-Policy, aucune modification de la bannière de
consentement ni de la politique de confidentialité. C'est le principal argument
en faveur de cette approche.

## Alternatives écartées

**Embed Cal.com après consentement.** Charge `app.cal.com` dans une iframe une
fois les cookies acceptés. Impose d'élargir `frame-src` et `script-src` dans
`vercel.json` *et* dans `src/middleware.ts` (les deux doivent rester
synchrones), plus une mise à jour de la politique de confidentialité et de
`CookieConsent.astro`. Écarté pour l'instant : coût sécurité et RGPD
disproportionné par rapport au gain (éviter une sortie de site).

**API Cal.com v2 avec interface maison.** Lecture des créneaux côté serveur,
formulaire Astro, réservation via un endpoint `/api/`. Laisse la CSP intacte
mais introduit une clé API, du rate-limiting, la gestion des fuseaux horaires,
des annulations et des erreurs réseau. Écarté : beaucoup de code à maintenir
pour un gain surtout esthétique.

Ces deux options restent ouvertes si le taux de sortie vers Cal.com pose
problème plus tard. Passer de A à B ne jette aucun travail : la page reste, seul
le bouton devient un embed.

## Fichiers

**Créés**

- `src/lib/booking.ts` — source unique de vérité : URL de réservation Cal.com,
  durée du rendez-vous, libellé du bouton. Aucune URL Cal.com en dur ailleurs
  dans le code.
- `src/pages/rendez-vous.astro` — la page, `export const prerender = true`,
  comme les autres pages marketing.

**Modifiés**

- `src/components/Header.astro` — lien « Prendre rendez-vous » à côté de
  « Nous contacter » (nav desktop) et dans le menu mobile.
- `src/components/Footer.astro` — entrée dans la colonne qui contient déjà
  « Nos services » et « Nous contacter ».
- `src/pages/contact.astro` — bloc court sous le formulaire renvoyant vers
  `/rendez-vous`.
- `src/pages/services.astro` — appel à l'action en fin de page.
- `vercel.json` — règle `Cache-Control` pour `/rendez-vous`, alignée sur celle
  de `/services` : `public, max-age=300, s-maxage=86400,
  stale-while-revalidate=604800`.

**Non modifiés, explicitement**

- `src/middleware.ts` et la CSP de `vercel.json` : inchangés.
- Le sitemap : `@astrojs/sitemap` découvre la page automatiquement. Ne rien
  ajouter à la main, et ne créer aucun fichier dans `public/` (un fichier
  statique y écraserait silencieusement la génération).
- `src/components/ContactForm.astro` et `src/pages/api/contact.ts`.

## Contenu de la page

Structure calquée sur `services.astro` pour rester cohérente avec le reste du
site :

1. Titre et sous-titre
2. À qui s'adresse ce rendez-vous
3. Ce qui se passe pendant : durée, visioconférence, gratuité, aucun engagement
4. Trois ou quatre questions fréquentes, courtes
5. Bouton principal vers Cal.com

Le bouton est un lien sortant : `target="_blank"` avec
`rel="noopener noreferrer"`, et un libellé qui indique explicitement que le
visiteur change de site.

SEO : `<title>` et `<meta name="description">` via le composant `BaseHead`
existant, comme les autres pages publiques.

## Accessibilité

- Le lien sortant annonce l'ouverture dans un nouvel onglet dans son texte
  accessible, pas uniquement par une icône.
- Le nouvel élément de navigation reste atteignable au clavier dans le menu
  mobile, qui utilise `role="menuitem"`.

## Gestion des erreurs

Aucun appel réseau, aucun état d'erreur à l'exécution. Le seul mode de panne est
une URL Cal.com invalide ou un événement Cal.com supprimé, ce qui produit une
page d'erreur côté Cal.com. Centraliser l'URL dans `src/lib/booking.ts` rend la
correction ponctuelle.

## Vérification

- `npm run build` — vérifie les types et la génération statique de la page
- `npm run check` — types et accessibilité de base
- `npm run lint`
- Contrôle manuel : la page se charge, le bouton ouvre bien Cal.com, le lien
  apparaît dans le header desktop, le menu mobile et le footer

Pas de nouveau test Playwright : un lien sortant statique n'en justifie pas.

## Entrée requise avant implémentation

L'URL exacte de réservation Cal.com, par exemple
`https://cal.com/biscuits-ia/decouverte-30min`. C'est la seule information
manquante ; tout le reste du design est arrêté.

## Note de périmètre

Le projet est en gel de changements UI/design depuis le 2026-07-09 (bugs,
sécurité et SEO uniquement). Cette page est une exception demandée
explicitement.
