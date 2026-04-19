/**
 * STEP 1 v2 — Scraping via Scraper Engine próprio (Hostinger VPS)
 *
 * Substitui Apify. Usa API interna rodando em api.dfy-ia.com.br.
 *
 * Rodar: bun run 1-scrape-v2.ts "clínica odontológica" "Campinas" 100
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCRAPER_URL = process.env.SCRAPER_URL || 'https://api.dfy-ia.com.br';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY!;

async function enqueue(query: string, city: string, limit: number): Promise<string> {
  const res = await fetch(`${SCRAPER_URL}/v1/scrape/google-maps`, {
    method: 'POST',
    headers: { 'x-api-key': SCRAPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, city, limit }),
  });
  if (!res.ok) throw new Error(`enqueue failed: ${res.status} ${await res.text()}`);
  const { jobId } = await res.json();
  return jobId;
}

async function pollJob(jobId: string): Promise<any> {
  while (true) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${SCRAPER_URL}/v1/job/scrape/${jobId}`, {
      headers: { 'x-api-key': SCRAPER_API_KEY },
    });
    const info = await res.json();
    const p = info.progress as any;
    if (p?.current != null) {
      process.stdout.write(`\r   progresso: ${p.current}/${p.total}   `);
    }
    if (info.state === 'completed') {
      console.log('\n✅ job concluído');
      return info.returnvalue;
    }
    if (info.state === 'failed') throw new Error(`job failed: ${info.failedReason}`);
  }
}

async function fetchLeads(query: string, city: string, limit: number): Promise<any[]> {
  const res = await fetch(
    `${SCRAPER_URL}/v1/leads?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}&limit=${limit}`,
    { headers: { 'x-api-key': SCRAPER_API_KEY } },
  );
  const { leads } = await res.json();
  return leads || [];
}

async function main() {
  const query = process.argv[2] || 'clínica odontológica';
  const city = process.argv[3] || 'Campinas';
  const limit = Number(process.argv[4] || 100);

  console.log(`🔍 Scraping via engine próprio: "${query}" em ${city} (limit ${limit})`);
  const jobId = await enqueue(query, city, limit);
  console.log(`📋 job ${jobId} enfileirado`);
  await pollJob(jobId);

  const leads = await fetchLeads(query, city, limit);
  const filtered = leads.filter((l) => l.phone && l.name);

  const date = new Date().toISOString().split('T')[0];
  const dir = join(import.meta.dir, '..', 'data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `leads-raw-${city.toLowerCase()}-${date}.json`);
  writeFileSync(file, JSON.stringify(filtered, null, 2));
  console.log(`💾 ${filtered.length} leads salvos em ${file}`);
}

main().catch(console.error);
