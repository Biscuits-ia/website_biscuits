import { expect, test } from '@playwright/test';

test('les repertoires publics servent une vraie page et non un listing Vercel', async ({
  page,
}) => {
  for (const path of ['/guides', '/auteur', '/public', '/blog/tag']) {
    const response = await page.goto(path, { waitUntil: 'networkidle' });
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('main h1'), path).toHaveCount(1);
    await expect(page.locator('body'), path).not.toContainText('Index of');
    await expect(page.locator('body'), path).not.toContainText('Files within');
  }
});

test('le blog ne maille que les themes suffisamment alimentes', async ({ page }) => {
  await page.goto('/blog', { waitUntil: 'networkidle' });
  const tagPaths = await page
    .locator('a[href^="/blog/tag/"]')
    .evaluateAll((links) => [
      ...new Set(links.map((link) => link.getAttribute('href')).filter(Boolean)),
    ]);
  expect(tagPaths.length).toBeGreaterThan(5);
  expect(tagPaths.length).toBeLessThanOrEqual(15);
});

test('la page des themes est explicitement hors index', async ({ page }) => {
  await page.goto('/blog/tag', { waitUntil: 'networkidle' });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('la page 404 renvoie vers le contact sans URL Cloudflare artificielle', async ({ page }) => {
  const response = await page.goto('/url-inexistante-test-indexation', {
    waitUntil: 'networkidle',
  });
  expect(response?.status()).toBe(404);
  await expect(page.locator('.error-help a[href="/contact"]')).toHaveCount(1);
  await expect(page.locator('a[href*="/cdn-cgi/"]')).toHaveCount(0);
});
