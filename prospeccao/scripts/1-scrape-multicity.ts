/**
 * Multi-city scrape. Roda 1-scrape-v2 pra várias cidades sequencialmente.
 * Uso: bun run 1-scrape-multicity.ts [query] [limit_por_cidade]
 * Env: SCRAPER_URL, SCRAPER_API_KEY, CITIES (csv, opt)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCRAPER_URL = process.env.SCRAPER_URL || 'https://api.dfy-ia.com.br';
const KEY = process.env.SCRAPER_API_KEY!;

const DEFAULT_CITIES = [
  'Campinas', 'Limeira', 'Piracicaba', 'Pirassununga', 'Rio Claro',
  'São Carlos', 'Americana', 'Sumaré', 'Hortolândia', 'Indaiatuba',
  'Jundiaí', 'Ribeirão Preto', 'Sorocaba', 'Araraquara', 'Mogi Mirim',
];

async function enqueue(query: string, city: string, limit: number) {
  const r = await fetch(`${SCRAPER_URL}/v1/scrape/google-maps`, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, city, limit }),
  });
  if (!r.ok) throw new Error(`enqueue ${city}: ${r.status} ${await r.text()}`);
  return (await r.json()).jobId as string;
}

async function poll(jobId: string, city: string) {
  while (true) {
    await new Promise(r => setTimeout(r, 5000));
    const r = await fetch(`${SCRAPER_URL}/v1/job/scrape/${jobId}`, { headers: { 'x-api-key': KEY } });
    const info = await r.json();
    if (info.progress?.current != null) process.stdout.write(`\r  [${city}] ${info.progress.current}/${info.progress.total}   `);
    if (info.state === 'completed') { console.log(`\n  ✅ ${city}`); return; }
    if (info.state === 'failed') { console.log(`\n  ❌ ${city}: ${info.failedReason}`); return; }
  }
}

async function fetchLeads(query: string, city: string, limit: number) {
  const r = await fetch(`${SCRAPER_URL}/v1/leads?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}&limit=${limit}`,
    { headers: { 'x-api-key': KEY } });
  return (await r.json()).leads || [];
}

async function main() {
  const query = process.argv[2] || 'clínica odontológica';
  const limit = Number(process.argv[3] || 60);
  const cities = (process.env.CITIES?.split(',').map(s => s.trim()).filter(Boolean)) || DEFAULT_CITIES;
  const date = new Date().toISOString().split('T')[0];
  const dir = join(import.meta.dir, '..', 'data');
  mkdirSync(dir, { recursive: true });

  console.log(`🌎 multi-city scrape: "${query}" × ${cities.length} cidades × limit ${limit}`);
  const all: any[] = [];
  const seen = new Set<string>();
  for (const city of cities) {
    try {
      const jobId = await enqueue(query, city, limit);
      console.log(`▶ ${city} (job ${jobId.slice(0, 8)})`);
      await poll(jobId, city);
      const leads = await fetchLeads(query, city, limit);
      const filtered = leads.filter(l => l.phone && l.name);
      for (const l of filtered) {
        const key = (l.phone || '').replace(/\D/g, '');
        if (key && !seen.has(key)) { seen.add(key); all.push({ ...l, city }); }
      }
      console.log(`  → ${filtered.length} leads (${all.length} únicos acumulados)`);
      writeFileSync(join(dir, `leads-raw-${city.toLowerCase().replace(/\s+/g, '-')}-${date}.json`), JSON.stringify(filtered, null, 2));
    } catch (e: any) {
      console.log(`  ❌ ${city}: ${e.message}`);
    }
  }

  const out = join(dir, `leads-raw-multicity-${date}.json`);
  writeFileSync(out, JSON.stringify(all, null, 2));
  console.log(`\n💾 ${all.length} leads únicos → ${out}`);
}

main().catch(console.error);
