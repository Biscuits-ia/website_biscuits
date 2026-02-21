/// <reference path="../.astro/types.d.ts" />
interface ImportMetaEnv {
  readonly PUBLIC_WEB3FORMS_ACCESS_KEY: string;
  readonly PUBLIC_POSTHOG_KEY: string;
  readonly PUBLIC_POSTHOG_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}