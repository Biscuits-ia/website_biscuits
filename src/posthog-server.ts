import { PostHog } from 'posthog-node';

let posthogInstance: PostHog | null = null;

export function getPostHogServer(): PostHog {
  if (!posthogInstance) {
    posthogInstance = new PostHog(
      import.meta.env.POSTHOG_API_KEY || process.env.POSTHOG_API_KEY || '',
      {
        host: import.meta.env.POSTHOG_HOST || process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
        // Flush events immediately in serverless/edge environments
        flushAt: 1,
        flushInterval: 0,
      }
    );
  }

  return posthogInstance;
}

// Graceful shutdown — call this if you have a long-running server
export async function shutdownPostHog(): Promise<void> {
  if (posthogInstance) {
    await posthogInstance.shutdown();
    posthogInstance = null;
  }
}
