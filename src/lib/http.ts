// src/lib/http.ts
// Helpers HTTP partages par toutes les routes API et le middleware.
//
// Un en-tete HTTP n'est fiable que lorsqu'une plateforme controlee l'impose et
// ecrase la valeur envoyee par le client. Sur ce projet, la source de verite est
// Vercel : `x-vercel-forwarded-for`, puis `clientAddress` fourni par Astro.

function extractTrustedIp(request: Request, clientAddress?: string | null): string | null {
  const vercel = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel;

  const fromAstro = typeof clientAddress === 'string' ? clientAddress.trim() : '';
  return fromAstro || null;
}

/** IP du client pour les journaux et la piste d'audit. */
export function getClientIp(request: Request, clientAddress?: string | null): string {
  return extractTrustedIp(request, clientAddress) ?? 'unknown';
}

/** IP du client, ou null lorsqu'elle ne peut pas etre determinee avec confiance. */
export function getClientIpOrNull(request: Request, clientAddress?: string | null): string | null {
  const ip = extractTrustedIp(request, clientAddress);
  if (!ip || ip === 'unknown') return null;
  return ip;
}
