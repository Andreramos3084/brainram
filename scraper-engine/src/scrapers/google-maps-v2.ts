/**
 * Google Maps Scraper v2 — robusto com retry, fallback e stealth aprimorado
 *
 * Melhorias:
 * - Retry automático (3x) com backoff exponencial
 * - Múltiplos seletores CSS fallback para cada campo
 * - Rotação de viewport e user-agent
 * - Detecção de CAPTCHA / bloqueio
 * - Proxy support (via env HTTP_PROXY)
 * - Timeout progressivo
 */

import type { Page, Browser } from 'playwright';
import { launchBrowser, newContext, humanDelay, humanScroll } from '../utils/stealth.js';

export interface GMapsLead {
  name: string;
  phone?: string;
  address?: string;
  website?: string;
  email?: string;
  category?: string;
  rating?: number;
  reviews?: number;
  mapsUrl?: string;
  placeId?: string;
  openingHours?: string;
}

const SELECTORS = {
  feed: [
    '[role="feed"]',
    'div[role="main"] > div > div > div:nth-child(4)',
    '[data-testid="search-results-feed"]',
  ],
  cards: [
    '[role="feed"] > div > div > a',
    '[role="feed"] a[href*="/maps/place/"]',
    'a[data-testid="place-card"]',
  ],
  name: [
    'h1',
    '[role="main"] h1',
    'h1.fontHeadlineLarge',
  ],
  rating: [
    '[role="img"][aria-label*="estrela"]',
    'span[aria-label*="estrela"]',
    'button[aria-label*="avalia"] span',
  ],
  reviews: [
    'button[aria-label*="avaliaç"]',
    'button[aria-label*="review"]',
    'span[aria-label*="comentários"]',
  ],
  phone: [
    'button[data-item-id*="phone"]',
    'a[href^="tel:"]',
    '[data-tooltip="Copiar telefone"]',
  ],
  address: [
    'button[data-item-id="address"]',
    '[data-tooltip="Copiar endereço"]',
    'span[aria-label*="endereço"]',
  ],
  website: [
    'button[data-item-id="authority"]',
    'a[data-item-id="authority"]',
    'a[href^="http"][target="_blank"]',
  ],
  category: [
    'button[jsaction*="category"]',
    'span[jstcache] > span[jstcache]',
    '[role="main"] span:first-of-type',
  ],
};

async function safeQuery<T>(page: Page, selectors: string[], extractor: (el: any) => T | null): Promise<T | null> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const val = await extractor(el);
        if (val !== null && val !== undefined && val !== '') return val;
      }
    } catch {
      // continue to next selector
    }
  }
  return null;
}

async function extractFromDetailV2(page: Page): Promise<Partial<GMapsLead>> {
  const data: Partial<GMapsLead> = {};

  data.name = await safeQuery(page, SELECTORS.name, async (el) => {
    const text = await el.textContent();
    return text?.trim() || null;
  }) || '';

  const ratingText = await safeQuery(page, SELECTORS.rating, async (el) => {
    return el.getAttribute('aria-label');
  });
  if (ratingText) {
    const m = ratingText.match(/([\d,.]+)/);
    if (m) data.rating = parseFloat(m[1].replace(',', '.'));
  }

  const reviewsText = await safeQuery(page, SELECTORS.reviews, async (el) => {
    return el.textContent();
  });
  if (reviewsText) {
    const m = reviewsText.match(/([\d.]+)/);
    if (m) data.reviews = parseInt(m[1].replace(/\./g, ''));
  }

  data.phone = await safeQuery(page, SELECTORS.phone, async (el) => {
    const text = await el.textContent();
    return text?.trim() || null;
  }) || undefined;

  data.address = await safeQuery(page, SELECTORS.address, async (el) => {
    const text = await el.textContent();
    return text?.trim() || null;
  }) || undefined;

  data.website = await safeQuery(page, SELECTORS.website, async (el) => {
    const href = await el.getAttribute('href');
    if (href && href.startsWith('http')) return href;
    const text = await el.textContent();
    return text?.trim() || null;
  }) || undefined;

  data.category = await safeQuery(page, SELECTORS.category, async (el) => {
    const text = await el.textContent();
    return text?.trim() || null;
  }) || undefined;

  // Tentar extrair email do website (se tiver website)
  if (data.website) {
    try {
      const email = await extractEmailFromWebsite(page.context(), data.website);
      if (email) data.email = email;
    } catch {
      // ignore
    }
  }

  return data;
}

async function extractEmailFromWebsite(context: any, url: string): Promise<string | undefined> {
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await humanDelay(1000, 2000);
    const html = await page.content();
    await page.close();

    // Regex para email
    const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
      // Filtrar emails comuns de spam/tech
      const exclude = ['noreply', 'no-reply', 'support', 'admin', 'info', 'contato', 'example', 'test'];
      const valid = matches.find((e: string) => !exclude.some(ex => e.toLowerCase().includes(ex)));
      return valid;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function scrapeWithRetry(
  query: string,
  city: string,
  limit = 100,
  onProgress?: (n: number, total: number) => void,
): Promise<GMapsLead[]> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await scrapeGoogleMapsV2(query, city, limit, onProgress);
    } catch (e: any) {
      lastError = e;
      console.warn(`⚠️ scrape attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) {
        const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error('all scrape attempts failed');
}

export async function scrapeGoogleMapsV2(
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

    // Detectar CAPTCHA / bloqueio
    const blocked = await page.$('text=/before you continue|verificação|unusual traffic/i');
    if (blocked) {
      throw new Error('Google Maps bloqueou (CAPTCHA ou tráfego incomum)');
    }

    // Esperar feed com fallback de seletores
    let feedFound = false;
    for (const sel of SELECTORS.feed) {
      try {
        await page.waitForSelector(sel, { timeout: 15_000 });
        feedFound = true;
        break;
      } catch {
        // try next
      }
    }
    if (!feedFound) {
      throw new Error('Feed de resultados não encontrado (possível mudança de layout)');
    }

    const feedSel = SELECTORS.feed.find(async s => !!(await page.$(s))) || SELECTORS.feed[0];
    let lastCount = 0;
    let stableIterations = 0;
    const visited = new Set<string>();

    while (results.length < limit) {
      const cards = await page.$$('a[href*="/maps/place/"]');
      const newCards: any[] = [];

      for (const card of cards) {
        const href = await card.getAttribute('href');
        if (href && !visited.has(href)) {
          visited.add(href);
          newCards.push(card);
        }
      }

      if (newCards.length === 0) {
        stableIterations++;
        if (stableIterations >= 5) break;
      } else {
        stableIterations = 0;
      }

      for (const card of newCards.slice(0, limit - results.length)) {
        try {
          const href = await card.getAttribute('href');
          await card.click();
          await humanDelay(1500, 3000);

          const detail = await extractFromDetailV2(page);
          if (detail.name) {
            results.push({
              name: detail.name,
              phone: detail.phone,
              address: detail.address,
              website: detail.website,
              email: detail.email,
              category: detail.category,
              rating: detail.rating,
              reviews: detail.reviews,
              mapsUrl: href || undefined,
            });
            onProgress?.(results.length, limit);
          }
        } catch (e) {
          console.warn('detail extraction failed:', (e as Error).message);
        }
      }

      // Scroll no feed
      try {
        await humanScroll(page);
      } catch {
        // ignore scroll errors
      }

      if (results.length >= limit) break;
    }
  } finally {
    await browser.close();
  }

  return results;
}

export { scrapeWithRetry };
