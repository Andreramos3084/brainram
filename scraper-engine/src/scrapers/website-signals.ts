/**
 * Website signals — detecta sinais de maturidade digital
 *
 * HTTP simples (fetch) + cheerio. Rápido, sem browser.
 */

import * as cheerio from 'cheerio';

export interface WebsiteSignals {
  url: string;
  reachable: boolean;
  title?: string;
  description?: string;
  hasWhatsappLink?: boolean;
  whatsappNumbers?: string[];
  hasFormulario?: boolean;
  hasOnlineBooking?: boolean;
  bookingProviders?: string[];
  hasAnalytics?: boolean;
  hasMetaPixel?: boolean;
  hasGoogleAds?: boolean;
  tech?: string[];
  socials?: { instagram?: string; facebook?: string; tiktok?: string; linkedin?: string };
}

const BOOKING_PATTERNS = [
  { name: 'calendly', re: /calendly\.com/i },
  { name: 'doctoralia', re: /doctoralia\.com/i },
  { name: 'agendor', re: /agendor\./i },
  { name: 'bookings', re: /bookings?\./i },
  { name: 'agenda', re: /agend[ae]/i },
  { name: 'simplybook', re: /simplybook/i },
];

export async function analyzeWebsite(url: string, timeoutMs = 10_000): Promise<WebsiteSignals> {
  if (!url.startsWith('http')) url = 'https://' + url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DFY-IA-bot/1.0)' },
    });
    if (!res.ok) return { url, reachable: false };
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim();
    const description = $('meta[name="description"]').attr('content') || '';

    const bodyLower = html.toLowerCase();

    const whatsappLinks = [
      ...html.matchAll(/wa\.me\/(\d+)/g),
      ...html.matchAll(/api\.whatsapp\.com\/send[^"']*phone=(\d+)/g),
    ].map((m) => m[1]);

    const hasFormulario = $('form').length > 0;

    const bookingProviders: string[] = [];
    for (const p of BOOKING_PATTERNS) if (p.re.test(html)) bookingProviders.push(p.name);

    const socials: WebsiteSignals['socials'] = {};
    const igMatch = html.match(/instagram\.com\/([A-Za-z0-9_\.]+)/);
    const fbMatch = html.match(/facebook\.com\/([A-Za-z0-9_\.\-]+)/);
    const ttMatch = html.match(/tiktok\.com\/@([A-Za-z0-9_\.]+)/);
    const liMatch = html.match(/linkedin\.com\/(?:in|company)\/([A-Za-z0-9_\-]+)/);
    if (igMatch) socials.instagram = igMatch[1];
    if (fbMatch) socials.facebook = fbMatch[1];
    if (ttMatch) socials.tiktok = ttMatch[1];
    if (liMatch) socials.linkedin = liMatch[1];

    const tech: string[] = [];
    if (bodyLower.includes('wp-content')) tech.push('wordpress');
    if (bodyLower.includes('wix.com')) tech.push('wix');
    if (bodyLower.includes('shopify')) tech.push('shopify');
    if (bodyLower.includes('/_next/')) tech.push('nextjs');
    if (bodyLower.includes('cdn.jsdelivr.net')) tech.push('cdn');

    return {
      url,
      reachable: true,
      title,
      description,
      hasWhatsappLink: whatsappLinks.length > 0,
      whatsappNumbers: [...new Set(whatsappLinks)],
      hasFormulario,
      hasOnlineBooking: bookingProviders.length > 0,
      bookingProviders,
      hasAnalytics: /gtag|google-analytics|analytics\.js/i.test(html),
      hasMetaPixel: /fbq\(|facebook\.com\/tr/i.test(html),
      hasGoogleAds: /googleads|adsbygoogle/i.test(html),
      tech,
      socials,
    };
  } catch {
    return { url, reachable: false };
  } finally {
    clearTimeout(timer);
  }
}
