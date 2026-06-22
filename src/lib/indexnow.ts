// src/lib/indexnow.ts
// Pousse les URLs modifiées vers IndexNow (Bing / Yandex / Seznam / Naver).
// API: POST https://api.indexnow.org/indexnow?key={key}&url={url-list}
// Convention de clé: fichier {key}.txt servi à https://{host}/{key}.txt.

const ENDPOINT = 'https://api.indexnow.org/indexnow';

export interface IndexNowOptions {
  key?: string;
  host?: string;
  keyLocation?: string;
  /** Liste d'URLs à soumettre. Si vide, la fonction est no-op. */
  urls: string[];
}

interface IndexNowResponse {
  status: number;
  body: string;
}

export async function submitToIndexNow(opts: IndexNowOptions): Promise<IndexNowResponse | null> {
  if (!opts.urls.length) return null;

  const key = opts.key ?? import.meta.env.INDEXNOW_KEY;
  if (!key) {
    console.warn('[IndexNow] No key configured, skipping submission');
    return null;
  }

  const host = opts.host ?? import.meta.env.PUBLIC_SITE_HOST ?? 'biscuits-ia.com';
  const keyLocation = opts.keyLocation ?? `https://${host}/${key}.txt`;

  const body = JSON.stringify({
    host,
    key,
    keyLocation,
    urlList: opts.urls,
  });

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    const text = await res.text();
    console.log(`[IndexNow] ${res.status} ${text} (${opts.urls.length} URLs)`);
    return { status: res.status, body: text };
  } catch (err) {
    console.error('[IndexNow] Submission failed:', err);
    return null;
  }
}

/** Construit la liste d'URLs canoniques à partir d'un chemin ou d'une liste. */
export function toAbsoluteUrls(siteUrl: string, paths: string[]): string[] {
  return paths.map((p) => {
    if (p.startsWith('http')) return p;
    const clean = p.startsWith('/') ? p : `/${p}`;
    return `${siteUrl.replace(/\/$/, '')}${clean}`;
  });
}