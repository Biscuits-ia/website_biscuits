///<reference types="astro/client" />

declare module '*.css';
interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SITE: string;
  readonly VERCEL_URL?: string;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string;
  /**
   * PUBLIC_ANALYTICS_DISABLED
   *
   * Mettez cette variable d'env a `true` pour desactiver completement
   * le chargement de Google Tag Manager et de Vercel Web Analytics
   * cote client. Utile en preprod, en local, ou en cas d'incident
   * cote tiers. Le flag est expose au runtime via `window.__ANALYTICS_DISABLED__`
   * et consulte par `BaseHead.astro` + `CookieConsent.tsx` AVANT toute
   * injection de `<script>` analytics. Defaut : non defini (= false).
   */
  readonly PUBLIC_ANALYTICS_DISABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    nonce: string;
    supabase: import('@supabase/supabase-js').SupabaseClient;
  }
}