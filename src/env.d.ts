// src/env.d.ts
///<reference types="astro/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  /**
   * SUPABASE_SERVICE_ROLE_KEY (DANGEREUSE -- bypass RLS).
   * Uniquement lisible cote serveur. Ne JAMAIS l'utiliser dans un composant
   * client (frontmatter .astro avec client:load, fichier .tsx importe par
   * un composant client). Le consommateur doit etre dans une API route,
   * le middleware, ou une lib executee cote serveur.
   */
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SITE: string;
  readonly VERCEL_URL?: string;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string;
  /**
   * PUBLIC_SUPABASE_PUBLISHABLE_KEY (nouveau format Supabase 2024+).
   * Le prefixe PUBLIC_ autorise l'exposition au client. Equivalent
   * moderne de l'ancienne anon key. Laissez vide tant que la migration
   * n'est pas faite.
   */
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * PUBLIC_SITE_URL -- URL absolue du site.
   * Utilisee par IndexNow, sitemap, og:url, schema.org.
   * Le prefixe PUBLIC_ permet l'usage cote client si besoin.
   */
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_SITE_HOST?: string;
  /**
   * PUBLIC_ANALYTICS_DISABLED
   * Mettre a true pour desactiver GTM + Vercel Web Analytics cote client.
   * Defaut : non defini (= false).
   */
  readonly PUBLIC_ANALYTICS_DISABLED?: string;
  /**
   * GTM_ID -- identifiant Google Tag Manager (ex. GTM-XXXXXXX).
   * Lu au build/SSR par BaseHead.astro, puis injecte dans le script inline via
   * `define:vars`. Non prefixe PUBLIC_ : la valeur n'est pas un secret (elle
   * finit dans le HTML), mais rien ne justifie de l'exposer au bundle client.
   * Absent ou vide => le bloc GTM n'est pas emis du tout.
   */
  readonly GTM_ID?: string;
  readonly INDEXNOW_KEY?: string;
  readonly CRON_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  namespace App {
    interface Locals {
      /**
       * Nonce CSP genere par le middleware, a passer EXPLICITEMENT :
       * `<script is:inline nonce={Astro.locals.nonce}>`.
       *
       * `undefined` sur les pages `prerender = true` : le middleware n'y tourne
       * qu'au BUILD. Un nonce y serait fige dans le HTML statique -- identique
       * pour tous les visiteurs, a vie -- donc sans aucune valeur de securite.
       * Ces pages recoivent leur CSP depuis vercel.json.
       *
       * Astro omet simplement l'attribut quand la valeur est `undefined`.
       */
      nonce?: string;
      /**
       * Client Supabase partage par la requete.
       * `undefined` sur les pages prerendered (le middleware sort tot).
       */
      supabase?: import('@supabase/supabase-js').SupabaseClient;
      /**
       * Headers no-cache emis par @supabase/ssr lors d'un setAll (cf.
       * lib/supabase.ts). Le middleware les recopie sur la reponse finale
       * pour empecher un CDN de cacher une reponse contenant un cookie
       * de session.
       */
      __extraResponseHeaders?: Record<string, string>;
    }
  }
}
export {};

// Garde-fou de typage : sert a documenter que la cle service_role
// ne doit pas etre lue depuis un bundle client. Voir lib/supabase.ts.
type __ServiceRoleKeyBrand = ImportMetaEnv['SUPABASE_SERVICE_ROLE_KEY'];
export type __SSRServiceRoleKey = __ServiceRoleKeyBrand;