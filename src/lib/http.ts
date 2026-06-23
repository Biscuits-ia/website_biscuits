// src/lib/http.ts
// Helpers HTTP partages par toutes les API routes et le middleware.
// Centralise l'extraction d'IP et la lecture securisee des headers proxy.
//
// Ordre de priorite (aligne sur la convention Vercel + Cloudflare) :
//   1. cf-connecting-ip  (Cloudflare)
//   2. x-real-ip         (nginx, load balancers)
//   3. x-forwarded-for   (premier hop = client original)
//   4. clientAddress     (fourni par Astro/Vercel)
//   5. 'unknown'         (fallback pour le rate-limit, jamais undefined)

export function getClientIp(
  request: Request,
  clientAddress?: string | null,
): string {
  const headers = request.headers;
  const cf = headers.get('cf-connecting-ip');
  const realIp = headers.get('x-real-ip');
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const fromAstro = typeof clientAddress === 'string' ? clientAddress : null;

  const ip = cf ?? realIp ?? forwarded ?? fromAstro ?? 'unknown';
  const normalized = ip.trim();
  return normalized || 'unknown';
}

// Version stricte : retourne null si aucune IP exploitable. Utile pour
// le middleware qui veut skipper le rate-limit en dev (cf. middleware.ts).
export function getClientIpOrNull(
  request: Request,
  clientAddress?: string | null,
): string | null {
  const headers = request.headers;
  const cf = headers.get('cf-connecting-ip');
  const realIp = headers.get('x-real-ip');
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const fromAstro = typeof clientAddress === 'string' ? clientAddress : null;

  const ip = cf ?? realIp ?? forwarded ?? fromAstro;
  if (!ip) return null;
  const normalized = ip.trim();
  if (!normalized || normalized === 'unknown') return null;
  return normalized;
}