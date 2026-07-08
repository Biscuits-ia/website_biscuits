// src/lib/secrets.ts
//
// Comparaison de secrets a temps constant.
//
// `a === b` sur des chaines court-circuite au premier octet different : le temps
// de reponse fuit la longueur du prefixe correct, ce qui permet de reconstruire
// un secret octet par octet (timing attack). Pour un Bearer token de cron, un
// attaquant qui peut mesurer la latence peut ainsi deviner CRON_SECRET.
//
// `crypto.timingSafeEqual` compare en temps constant. Il exige deux buffers de
// MEME longueur -- sinon il jette. On hache donc les deux cotes en SHA-256
// avant comparaison : longueur fixe (32 octets), et la comparaison ne revele
// jamais la longueur du secret attendu.

import { createHash, timingSafeEqual } from 'node:crypto';

/** Compare deux chaines a temps constant, insensible a leur longueur. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  // Meme longueur garantie (32 octets) : timingSafeEqual ne jette pas.
  return timingSafeEqual(ha, hb);
}

/**
 * Valide un header `Authorization: Bearer <secret>` a temps constant.
 *
 * @param authHeader  Valeur brute du header (ou null).
 * @param expected    Secret attendu (ex. import.meta.env.CRON_SECRET).
 * @returns true si et seulement si le header vaut exactement `Bearer <expected>`.
 */
export function verifyBearer(authHeader: string | null, expected: string | undefined): boolean {
  if (!expected || !authHeader) return false;
  return safeEqual(authHeader, `Bearer ${expected}`);
}
