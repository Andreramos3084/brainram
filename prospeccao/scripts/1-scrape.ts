/**
 * STEP 1 — Scraping Google Maps via Apify
 *
 * Input:  nicho + cidade
 * Output: prospeccao/data/leads-raw-{date}.json
 *
 * Rodar: bun run 1-scrape.ts "clínica odontológica" "Campinas"
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;
const APIFY_ACTOR = 'compass/crawler-google-places';

interface Lead {
  name: string;
  phone?: string;
  address?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviews?: number;
  mapsUrl?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

async function scrape(query: string, city: string, limit = 100): Promise<Lead[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [`${query} ${city}`],
        maxCrawledPlacesPerSearch: limit,
        language: 'pt-BR',
        countryCode: 'br',
      }),
    },
  );

  if (!res.ok) throw new Error(`Apify failed: ${res.status} ${await res.text()}`);

  const raw = await res.json();
  return raw.map((item: any) => ({
    name: item.title,
    phone: item.phone,
    address: item.address,
    website: item.website,
    category: item.categoryName,
    rating: item.totalScore,
    reviews: item.reviewsCount,
    mapsUrl: item.url,
    lat: item.location?.lat,
    lng: item.location?.lng,
    placeId: item.placeId,
  }));
}

async function main() {
  const query = process.argv[2] || 'clínica odontológica';
  const city = process.argv[3] || 'Campinas';
  const limit = Number(process.argv[4] || 100);

  console.log(`🔍 Scraping: "${query}" em ${city} (limit: ${limit})`);

  const leads = await scrape(query, city, limit);
  const filtered = leads.filter((l) => l.phone && l.name);

  const date = new Date().toISOString().split('T')[0];
  const dir = join(import.meta.dir, '..', 'data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `leads-raw-${city.toLowerCase()}-${date}.json`);

  writeFileSync(file, JSON.stringify(filtered, null, 2));
  console.log(`✅ ${filtered.length} leads salvos em ${file}`);
}

main().catch(console.error);
