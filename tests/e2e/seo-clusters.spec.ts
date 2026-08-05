import { expect, test } from '@playwright/test';

const CLUSTERS = [
  {
    guide: '/guides/arnaques-ia',
    article: '/blog/detecter-arnaque-ia',
  },
  {
    guide: '/guides/ia-associations',
    article: '/blog/ia',
  },
  {
    guide: '/guides/ia-open-source',
    article: '/blog/ia-open-source-association-biscuits',
  },
] as const;

test.describe('Cocons semantiques du blog', () => {
  for (const cluster of CLUSTERS) {
    test(`${cluster.guide} est indexable et relie ses articles`, async ({ page }) => {
      const response = await page.goto(cluster.guide, { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${cluster.guide.replaceAll('/', '\\/')}$`)
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index/);
      await expect(page.locator(`a[href="${cluster.article}"]`).first()).toBeVisible();
      expect(await page.locator('article a[href^="/blog/"]').count()).toBeGreaterThan(2);
    });

    test(`${cluster.article} expose le maillage et les donnees Article`, async ({ page }) => {
      const response = await page.goto(cluster.article, { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);

      await expect(page.locator(`a[href="${cluster.guide}"]`).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sources de référence' })).toBeVisible();
      expect(await page.locator('.article-sources a[href^="http"]').count()).toBeGreaterThanOrEqual(
        3
      );
      await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(1);
      await expect(page.locator('meta[property="article:modified_time"]')).toHaveCount(1);

      const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
      const graph = schemas.flatMap((schema) => {
        const parsed = JSON.parse(schema) as { '@graph'?: Record<string, unknown>[] };
        return parsed['@graph'] ?? [];
      });
      const article = graph.find((node) => node['@type'] === 'Article');
      expect(article).toBeDefined();
      expect(article?.isPartOf).toMatchObject({ '@type': 'CollectionPage' });
      expect(article?.citation).toHaveLength(3);
    });
  }
});
