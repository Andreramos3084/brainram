/**
 * Instagram scraper — coleta sinais públicos
 *
 * NÃO faz login. Só lê o que é público: bio, nº seguidores, nº posts, última postagem.
 * Usa o endpoint público /?__a=1 (quando disponível) + fallback HTML parsing.
 */

import type { Page } from 'playwright';
import { launchBrowser, newContext, humanDelay } from '../utils/stealth.js';

export interface InstagramSignals {
  handle: string;
  exists: boolean;
  followers?: number;
  following?: number;
  posts?: number;
  bio?: string;
  isBusinessAccount?: boolean;
  category?: string;
  externalUrl?: string;
  lastPostDate?: string;
}

function handleFromUrlOrHandle(input: string): string {
  if (input.startsWith('http')) {
    const m = input.match(/instagram\.com\/([^\/?]+)/);
    return m ? m[1] : '';
  }
  return input.replace(/^@/, '');
}

function parseNumber(text: string): number | undefined {
  const clean = text.toLowerCase().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  if (isNaN(num)) return undefined;
  if (clean.includes('k') || clean.includes('mil')) return Math.round(num * 1000);
  if (clean.includes('m') || clean.includes('mi')) return Math.round(num * 1_000_000);
  return Math.round(num);
}

export async function scrapeInstagram(handleOrUrl: string): Promise<InstagramSignals> {
  const handle = handleFromUrlOrHandle(handleOrUrl);
  if (!handle) return { handle: '', exists: false };

  const browser = await launchBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();

  try {
    const url = `https://www.instagram.com/${handle}/`;
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    if (resp && resp.status() === 404) return { handle, exists: false };

    await humanDelay(1200, 2400);

    const data = await page.evaluate(() => {
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      const metaTag = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

      // meta description format: "X Seguidores, Y Seguindo, Z Publicações - Ver fotos e vídeos..."
      const match = metaDesc.match(/([\d.,KkMm]+)\s*Seguidores,\s*([\d.,KkMm]+)\s*Seguindo,\s*([\d.,]+)\s*Publicações/i);

      return {
        metaDesc,
        ogTitle,
        metaTag,
        rawFollowers: match?.[1],
        rawFollowing: match?.[2],
        rawPosts: match?.[3],
      };
    });

    return {
      handle,
      exists: true,
      followers: data.rawFollowers ? parseNumber(data.rawFollowers) : undefined,
      following: data.rawFollowing ? parseNumber(data.rawFollowing) : undefined,
      posts: data.rawPosts ? parseNumber(data.rawPosts) : undefined,
      bio: data.metaTag || data.metaDesc,
    };
  } catch (e) {
    return { handle, exists: false };
  } finally {
    await context.close();
    await browser.close();
  }
}
