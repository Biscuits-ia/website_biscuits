import { expect, test } from '@playwright/test';
import { countHeadings } from './helpers/dom';

const PUBLIC_TEMPLATES = [
  '/',
  '/blog',
  '/blog/tag',
  '/blog/ia',
  '/blog/kit-protection-association-arnaque-ia',
  '/blog/tag/accessibilite',
  '/auteur',
  '/guides',
  '/guides/arnaques-ia',
  '/guides/ia-associations',
  '/guides/ia-open-source',
  '/public',
  '/legal/politique-de-confidentialite',
] as const;

test.describe('Structure semantique publique', () => {
  for (const path of PUBLIC_TEMPLATES) {
    test(`${path} a une structure principale unique`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);
      expect(await countHeadings(page, 1), 'un seul h1 est attendu').toBe(1);
      expect(await page.locator('main').count(), 'un seul main est attendu').toBe(1);

      const duplicateIds = await page.evaluate(() => {
        const counts = new Map<string, number>();
        for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
          counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
        }
        return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
      });
      expect(duplicateIds, `IDs dupliques: ${duplicateIds.join(', ')}`).toEqual([]);
    });
  }
});
