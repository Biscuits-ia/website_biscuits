import type { APIRoute } from 'astro';
import { getPostHogServer } from '../../../lib/posthog-server';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Une adresse email valide est requise.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Format d\'email invalide.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get PostHog session ID from client if available
    const sessionId = request.headers.get('X-PostHog-Session-Id') || undefined;
    const distinctId = request.headers.get('X-PostHog-Distinct-Id') || email;

    // Track server-side newsletter subscription event
    const posthog = getPostHogServer();
    posthog.capture({
      distinctId,
      event: 'newsletter_subscription_server',
      properties: {
        $session_id: sessionId,
        email_domain: email.split('@')[1],
        source: 'api',
      },
    });

    // Also identify the user server-side
    posthog.identify({
      distinctId,
      properties: {
        email,
        newsletter_subscribed: true,
        newsletter_subscribed_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Inscription réussie !' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    return new Response(
      JSON.stringify({ error: 'Erreur interne. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
