import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ params, request }) => {
  const { assistant } = params;

  // Validation de l'assistant
  if (!['support', 'dev', 'sales'].includes(assistant || '')) {
    return new Response(
      JSON.stringify({ error: 'Assistant invalide' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();

    // Validation basique
    if (!body.message || typeof body.message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (body.message.length > 4000) {
      return new Response(
        JSON.stringify({ error: 'Message trop long (max 4000 caractères)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Appel à l'API Laravel
    const laravelApiUrl = import.meta.env.LARAVEL_API_URL || 'https://biscuits-admin-main-1a6oe6.laravel.cloudZ';
    const response = await fetch(`${laravelApiUrl}/api/ai/${assistant}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        message: body.message,
        conversation_id: body.conversation_id || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          error: errorData.message || 'Erreur serveur',
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Erreur API AI:', error);
    return new Response(
      JSON.stringify({
        error: 'Une erreur est survenue lors du traitement de votre message',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

// Rate limiting simple (optionnel)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = requestCounts.get(ip);

  if (!limit || now > limit.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + 60000 }); // 1 minute
    return true;
  }

  if (limit.count >= 10) {
    return false;
  }

  limit.count++;
  return true;
}