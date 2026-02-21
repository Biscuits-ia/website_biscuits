<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Biscuits IA Astro (Hybrid) project. Here is a summary of every change made:

## Summary of changes

- **`src/components/posthog.astro`** — Rewrote to use `define:vars` with `is:inline` so that `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` are injected from environment variables at build time. No keys are hardcoded.
- **`src/layouts/Layout.astro`** — Added the `PostHog` component import and `<PostHog />` tag in `<head>` to enable client-side tracking on every page.
- **`src/lib/posthog-server.ts`** *(new)* — Singleton pattern for the `posthog-node` server-side client. Shared across all API routes so only one instance is created.
- **`src/pages/api/newsletter/subscribe.ts`** *(new)* — Implements the newsletter subscription endpoint (previously missing). Tracks `newsletter_subscription_server` server-side and identifies users via `posthog-node`. Accepts `X-PostHog-Session-Id` and `X-PostHog-Distinct-Id` headers for session correlation.
- **`src/components/svelte/ContactForm.svelte`** — Added `contact_form_submitted` capture on success (with subject and message length properties), `contact_form_error` capture on failure, and `captureException` for error tracking.
- **`src/components/svelte/NewsletterForm.svelte`** — Added `newsletter_subscribed` capture on success, `newsletter_subscription_error` on failure. Passes PostHog session ID and distinct ID to the server API via headers.
- **`src/components/svelte/CookieConsent.svelte`** — Added `cookie_consent_accepted` and `cookie_consent_declined` events so you can measure GDPR opt-in/opt-out rates.
- **`src/env.d.ts`** — Added TypeScript types for `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST`.
- **`.env`** — Created with `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` (covered by `.gitignore`).
- **`package.json`** — `posthog-js@1.352.0` and `posthog-node@5.24.17` added as dependencies.

## Event tracking table

| Event name | Description | File |
|---|---|---|
| `contact_form_submitted` | User successfully submitted the contact / quote form | `src/components/svelte/ContactForm.svelte` |
| `contact_form_error` | An error occurred when submitting the contact form | `src/components/svelte/ContactForm.svelte` |
| `newsletter_subscribed` | User successfully subscribed to the newsletter | `src/components/svelte/NewsletterForm.svelte` |
| `newsletter_subscription_error` | An error occurred when subscribing to the newsletter | `src/components/svelte/NewsletterForm.svelte` |
| `cookie_consent_accepted` | User accepted analytics cookies in the consent banner | `src/components/svelte/CookieConsent.svelte` |
| `cookie_consent_declined` | User declined optional cookies in the consent banner | `src/components/svelte/CookieConsent.svelte` |
| `newsletter_subscription_server` | Server-side confirmation of a newsletter subscription | `src/pages/api/newsletter/subscribe.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

### Dashboard
- [Analytics basics](https://eu.posthog.com/project/129775/dashboard/534769)

### Insights
- [Lead Generation — Contact Form & Newsletter Signups](https://eu.posthog.com/project/129775/insights/QYe0Y6gO) — Daily trend of the two primary lead capture actions.
- [Conversion Funnel — Visit to Contact Form](https://eu.posthog.com/project/129775/insights/WC7wXhVF) — Measures what percentage of site visitors go on to submit the contact form.
- [Cookie Consent Rate](https://eu.posthog.com/project/129775/insights/WI17vcVR) — Accept vs. decline ratio to understand GDPR impact on data coverage.
- [Form Error Rate](https://eu.posthog.com/project/129775/insights/AYIWhiv0) — Surfaces API or network errors that silently block lead capture.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-astro-hybrid/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
