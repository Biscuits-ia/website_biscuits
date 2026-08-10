/**
 * Source unique de verite pour le rendez-vous de decouverte.
 *
 * La page `/rendez-vous` se contente d'un lien sortant vers Cal.com : aucun
 * script tiers, aucun cookie tiers, aucune modification de la CSP. Si l'URL ou
 * la duree changent, c'est le seul fichier a toucher — aucune URL Cal.com ne
 * doit etre ecrite en dur ailleurs dans le code.
 */

/**
 * Profil Cal.com de l'association : la page liste les types de rendez-vous
 * publies. Aucune cle API n'est necessaire ici — le lien est public.
 */
export const CAL_BOOKING_URL = 'https://cal.com/biscuits-ia';

/** Duree du rendez-vous de decouverte, en minutes. */
export const BOOKING_DURATION_MINUTES = 30;

/** Libelle du bouton principal menant a Cal.com. */
export const BOOKING_CTA_LABEL = 'Choisir un créneau sur Cal.com';
