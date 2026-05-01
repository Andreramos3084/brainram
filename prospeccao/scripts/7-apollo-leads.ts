/**
 * Apollo.io Lead Extractor
 * Busca contatos por cargo/cidade e enriquece com email/telefone.
 *
 * Uso: bun run 7-apollo-leads.ts [--enrich]
 * Env: APOLLO_API_KEY
 *
 * O endpoint api_search é gratuito. Enrichment consome créditos:
 *   - email: 1 crédito por contato
 *   - telefone: 8 créditos por contato
 *
 * Plano Free: ~100-120 emails/mês, ~5 telefones/mês
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const API_KEY = process.env.APOLLO_API_KEY!;
if (!API_KEY) throw new Error('Env APOLLO_API_KEY required');

const ENRICH = process.argv.includes('--enrich');
const OUT = 'data/apollo-leads.json';
const LOG = 'data/apollo-log.jsonl';

// Configurações de busca por nicho
const SEARCH_CONFIGS = [
  {
    niche: 'Odontologia',
    titles: ['dentist', 'dental', 'odontologista', 'dentista'],
    locations: ['São Paulo, Brazil', 'Rio de Janeiro, Brazil', 'Belo Horizonte, Brazil', 'Curitiba, Brazil', 'Porto Alegre, Brazil'],
  },
  {
    niche: 'Estética',
    titles: ['esteticista', 'beauty', 'aesthetic', 'spa owner', 'clinic owner'],
    locations: ['São Paulo, Brazil', 'Rio de Janeiro, Brazil', 'Curitiba, Brazil', 'Brasília, Brazil'],
  },
  {
    niche: 'Medicina',
    titles: ['physician', 'medical director', 'clinic owner', 'doctor'],
    locations: ['São Paulo, Brazil', 'Rio de Janeiro, Brazil', 'Belo Horizonte, Brazil'],
  },
  {
    niche: 'Fisioterapia',
    titles: ['physiotherapist', 'physical therapist', 'fisioterapeuta', 'clinic owner'],
    locations: ['São Paulo, Brazil', 'Curitiba, Brazil', 'Porto Alegre, Brazil'],
  },
  {
    niche: 'Laboratório',
    titles: ['laboratory director', 'lab manager', 'clinical laboratory'],
    locations: ['São Paulo, Brazil', 'Rio de Janeiro, Brazil', 'Belo Horizonte, Brazil'],
  },
];

async function apiSearch(titles: string[], location: string, page: number = 1, perPage: number = 100): Promise<any> {
  const url = new URL('https://api.apollo.io/api/v1/mixed_people/api_search');
  for (const t of titles) url.searchParams.append('person_titles[]', t);
  url.searchParams.append('person_locations[]', location);
  url.searchParams.append('per_page', String(perPage));
  url.searchParams.append('page', String(page));

  const r = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': API_KEY,
    },
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Apollo search error ${r.status}: ${err}`);
  }
  return r.json();
}

async function enrichBulk(ids: string[]): Promise<any[]> {
  const r = await fetch('https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=true&reveal_phone_number=true', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': API_KEY,
    },
    body: JSON.stringify({ details: ids.map(id => ({ id })) }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Apollo enrich error ${r.status}: ${err}`);
  }
  const data = await r.json();
  return data.people || [];
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const allLeads: any[] = [];
  let totalSearch = 0;
  let totalEnrich = 0;

  for (const config of SEARCH_CONFIGS) {
    console.log(`\n🔍 [${config.niche}] Buscando...`);

    for (const location of config.locations) {
      console.log(`  📍 ${location}`);

      try {
        const data = await apiSearch(config.titles, location, 1, 100);
        const people = data.people || [];
        totalSearch += people.length;

        console.log(`     Encontrados: ${people.length} (total entries: ${data.total_entries || '?'})`);

        // Salvar metadados básicos
        for (const p of people) {
          const lead = {
            source: 'apollo',
            niche: config.niche,
            city: location.split(',')[0],
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
            title: p.title || '',
            organization: p.organization?.name || '',
            linkedin: p.linkedin_url || '',
            state: p.state || '',
            city_person: p.city || '',
            has_email: p.has_email || false,
            has_phone: p.has_direct_phone || false,
            apollo_id: p.id,
            email: null as string | null,
            phone: null as string | null,
          };
          allLeads.push(lead);
        }

        // Enrichment (se --enrich e houver IDs)
        if (ENRICH && people.length > 0) {
          const ids = people.filter((p: any) => p.has_email || p.has_direct_phone).map((p: any) => p.id);
          if (ids.length > 0) {
            // Bulk em grupos de 10
            for (let i = 0; i < ids.length; i += 10) {
              const batch = ids.slice(i, i + 10);
              console.log(`     🔧 Enriching batch ${i / 10 + 1}/${Math.ceil(ids.length / 10)} (${batch.length} IDs)`);

              try {
                const enriched = await enrichBulk(batch);
                totalEnrich += enriched.length;

                for (const e of enriched) {
                  const lead = allLeads.find(l => l.apollo_id === e.id);
                  if (lead) {
                    lead.email = e.email || e.personal_emails?.[0] || null;
                    lead.phone = e.phone_number || e.mobile_phone || e.direct_phone || null;
                  }
                }

                await sleep(1000); // Rate limit
              } catch (err: any) {
                console.error(`     ❌ Enrich error: ${err.message}`);
              }
            }
          }
        }

        await sleep(1500); // Rate limit entre cidades
      } catch (err: any) {
        console.error(`  ❌ Error: ${err.message}`);
      }
    }
  }

  // Salvar resultados
  ensureDir(OUT);
  writeFileSync(OUT, JSON.stringify(allLeads, null, 2));

  ensureDir(LOG);
  appendFileSync(LOG, JSON.stringify({
    ts: new Date().toISOString(),
    total_search: totalSearch,
    total_enrich: totalEnrich,
    with_email: allLeads.filter(l => l.email).length,
    with_phone: allLeads.filter(l => l.phone).length,
    enrich_mode: ENRICH,
  }) + '\n');

  console.log(`\n🏁 DONE`);
  console.log(`   Total leads: ${allLeads.length}`);
  console.log(`   Com email: ${allLeads.filter(l => l.email).length}`);
  console.log(`   Com telefone: ${allLeads.filter(l => l.phone).length}`);
  console.log(`   Arquivo: ${OUT}`);
}

main().catch(console.error);
