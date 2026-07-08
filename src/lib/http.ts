// src/lib/http.ts
// Helpers HTTP partages par toutes les API routes et le middleware.
// Source de verite unique pour l'identification du client.
//
// ─── POURQUOI ON NE LIT PLUS cf-connecting-ip / x-real-ip / x-forwarded-for ───
//
// Un header HTTP n'est digne de confiance QUE s'il est ecrit par un proxy qu'on
// controle ET que ce proxy ecrase la valeur envoyee par le client.
//
// Ce site tourne sur Vercel, PAS derriere Cloudflare. Vercel ne supprime pas
// `cf-connecting-ip` des requetes entrantes : c'est donc un champ librement
// choisi par l'appelant. L'ancienne implementation le lisait EN PRIORITE 1.
//
// Consequence : le rate-limit etait entierement contournable.
//
//     for i in $(seq 1 100000); do
//       curl -s https://biscuits-ia.com/auth/connexion \
//         -H "cf-connecting-ip: 1.2.3.$((RANDOM % 255))" \
//         -d "email=victim@x.fr&password=guess$i"
//     done
//
// La limite de 5 tentatives/minute sur /auth/connexion voyait 100 000 "IP"
// distinctes -> brute force et credential stuffing sans plafond.
//
// Sur Vercel, `x-vercel-forwarded-for` est le SEUL header pose par la plateforme
// et systematiquement ecrase (toute valeur cliente est ignoree). `clientAddress`
// d'Astro en derive. Cf. https://vercel.com/docs/headers/request-headers
//
// Si un jour le site passe derriere Cloudflare, alors -- et seulement alors --
// `cf-connecting-ip` redevient exploitable, a condition que l'origine n'accepte
// que le trafic venant des plages d'IP Cloudflare.

/** Extrait l'IP client depuis les seuls headers ecrits par la plateforme. */
function extractTrustedIp(request: Request, clientAddress?: string | null): string | null {
  // Pose par l'edge Vercel. Ecrase toute valeur fournie par le client.
  const vercel = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel;

  // Fourni par l'adaptateur Astro (derive du meme header cote Vercel ;
  // socket distant en local).
  const fromAstro = typeof clientAddress === 'string' ? clientAddress.trim() : '';
  return fromAstro || null;
}

/**
 * IP du client, ou 'unknown' si indeterminable.
 * Pour le LOGGING et l'audit trail. Ne jamais s'en servir seul comme clef de securite.
 */
export function getClientIp(request: Request, clientAddress?: string | null): string {
  return extractTrustedIp(request, clientAddress) ?? 'unknown';
}

/**
 * IP du client, ou `null` si indeterminable.
 *
 * Pour le RATE-LIMIT : un `null` doit conduire a NE PAS compter la requete
 * plutot qu'a la ranger dans un seau partage 'unknown' -- ce dernier serait
 * trivialement sature par un attaquant, bloquant les utilisateurs legitimes.
 */
export function getClientIpOrNull(request: Request, clientAddress?: string | null): string | null {
  const ip = extractTrustedIp(request, clientAddress);
  if (!ip || ip === 'unknown') return null;
  return ip;
}
