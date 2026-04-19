/**
 * Google Maps scraper — substitui Apify
 *
 * Estratégia: navegar em maps.google.com?q=, esperar resultados renderizarem,
 * scroll no painel lateral até carregar até `limit` cards, extrair dados
 * clicando em cada card para pegar detalhes completos.
 */

import type { Page } from 'playwright';
import { launchBrowser, newContext, humanDelay, humanScroll } from '../utils/stealth.js';

export interface GMapsLead {
  name: string;
  phone?: string;
  address?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviews?: number;
  mapsUrl?: string;
  placeId?: string;
  openingHours?: string;
}

async function extractFromDetail(page: Page): Promise<Partial<GMapsLead>> {
  const data = await page.evaluate(() => {
    const q = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';
    const qAll = (sel: string) => Array.from(document.querySelectorAll(sel));

    const nameEl = document.querySelector('h1');
    const name = nameEl?.textContent?.trim() || '';

    const ratingText = document.querySelector('[role="img"][aria-label*="estrela"]')?.getAttribute('aria-label') || '';
    const ratingMatch = ratingText.match(/([\d,\.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : undefined;

    const reviewsText = document.querySelector('button[aria-label*="avaliaç"]')?.textContent || '';
    const reviewsMatch = reviewsText.match(/([\d\.]+)/);
    const reviews = reviewsMatch ? parseInt(reviewsMatch[1].replace(/\./g, '')) : undefined;

    const buttons = qAll('button[data-item-id]');
    let phone = '', address = '', website = '';
    for (const btn of buttons) {
      const id = btn.getAttribute('data-item-id') || '';
      const text = btn.textContent?.trim() || '';
      if (id.startsWith('phone')) phone = text;
      else if (id === 'address') address = text;
      else if (id === 'authority') website = btn.getAttribute('aria-label')?.replace('Site: ', '') || text;
    }

    const category = document.querySelector('button[jsaction*="category"]')?.textContent?.trim() || '';

    return { name, phone, address, website, category, rating, reviews };
  });
  return data;
}

export async function scrapeGoogleMaps(
  query: string,
  city: string,
  limit = 100,
  onProgress?: (n: number, total: number) => void,
): Promise<GMapsLead[]> {
  const browser = await launchBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();
  const results: GMapsLead[] = [];

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${query} em ${city}`)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await humanDelay(2000, 4000);

    // Wait for feed panel
    await page.waitForSelector('[role="feed"]', { timeout: 30_000 });

    const feedSel = '[role="feed"]';
    let lastCount = 0;
    let stableIterations = 0;

    while (results.length < limit && stableIterations < 3) {
      // Scroll feed
      await page.evaluate((sel) => {
        const feed = document.querySelector(sel);
        if (feed) feed.scrollTop = feed.scrollHeight;
      }, feedSel);
      await humanDelay(1500, 3000);

      // Collect card links (places)
      const cardHrefs: string[] = await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (!feed) return [];
        return Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'))
          .map((a) => (a as HTMLAnchorElement).href);
      });

      const unique = [...new Set(cardHrefs)];
      if (unique.length === lastCount) {
        stableIterations++;
      } else {
        lastCount = unique.length;
        stableIterations = 0;
      }

      // Extract details for new cards
      for (const href of unique) {
        if (results.length >= limit) break;
        if (results.find((r) => r.mapsUrl === href)) continue;

        try {
          await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await humanDelay(1500, 2800);
          const detail = await extractFromDetail(page);
          if (detail.name) {
            const placeIdMatch = href.match(/!1s([^!]+)/);
            results.push({
              ...detail,
              name: detail.name!,
              mapsUrl: href,
              placeId: placeIdMatch?.[1],
            });
            onProgress?.(results.length, limit);
          }
        } catch (e) {
          console.warn(`  ⚠ falha em ${href}: ${(e as Error).message}`);
        }
      }

      // Back to search
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(feedSel, { timeout: 15_000 });
      await humanScroll(page, 1);
    }

    return results.slice(0, limit);
  } finally {
    await context.close();
    await browser.close();
  }
}
