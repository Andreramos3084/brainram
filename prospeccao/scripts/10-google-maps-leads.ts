/**
 * Google Maps Places API Lead Extractor
 * Busca estabelecimentos de saúde por cidade/nicho.
 *
 * Uso: bun run 10-google-maps-leads.ts
 * Env: GOOGLE_PLACES_API_KEY
 *
 * Preço (novo Places API): ~$0.025 por requisição de search
 * Crédito gratuito: $200/mês = ~8.000 buscas/mês
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
if (!API_KEY) throw new Error('Env GOOGLE_PLACES_API_KEY required. Get one at https://developers.google.com/maps/documentation/places/web-service/get-api-key');

const OUT = 'data/gmaps-leads.json';
const LOG = 'data/gmaps-log.jsonl';

// Busca por nicho/cidade
const SEARCHES = [
  { niche: 'Odontologia', query: 'consultório odontológico' },
  { niche: 'Odontologia', query: 'dentista' },
  { niche: 'Laboratório de Exames', query: 'laboratório de exames' },
  { niche: 'Centro de Imagem', query: 'centro de diagnóstico por imagem' },
  { niche: 'Centro de Imagem', query: 'clínica de radiologia' },
  { niche: 'Cardiologia', query: 'cardiologista' },
  { niche: 'Cardiologia', query: 'clínica cardiológica' },
  { niche: 'Quiropraxia', query: 'quiropraxia' },
  { niche: 'Estética', query: 'clínica de estética' },
  { niche: 'Estética', query: 'spa estética' },
];

const CITIES = [
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
  { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
  { name: 'Belo Horizonte', lat: -19.9167, lng: -43.9345 },
  { name: 'Curitiba', lat: -25.4290, lng: -49.2671 },
  { name: 'Porto Alegre', lat: -30.0346, lng: -51.2177 },
  { name: 'Brasília', lat: -15.7975, lng: -47.8919 },
  { name: 'Campinas', lat: -22.9064, lng: -47.0616 },
  { name: 'Salvador', lat: -12.9714, lng: -38.5014 },
  { name: 'Fortaleza', lat: -3.7172, lng: -38.5433 },
  { name: 'Florianópolis', lat: -27.5949, lng: -48.5480 },
];

// Radius in meters for city search
const RADIUS = 15000; // 15km

interface PlaceResult {
  places?: Array<{
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
    businessStatus?: string;
    types?: string[];
  }>;
}

async function searchNearby(lat: number, lng: number, query: string): Promise<PlaceResult> {
  const r = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,places.types',
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: RADIUS,
        },
      },
      maxResultCount: 20,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Google Places error ${r.status}: ${err.slice(0, 200)}`);
  }
  return r.json();
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function cleanPhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Add Brazil country code if missing
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits;
  }
  return digits;
}

async function main() {
  const allLeads: any[] = [];
  const seenPhones = new Set<string>();
  let totalApiCalls = 0;
  let totalPlaces = 0;
  let totalWithPhone = 0;

  for (const search of SEARCHES) {
    console.log(`\n🔍 [${search.niche}] "${search.query}"`);

    for (const city of CITIES) {
      console.log(`  📍 ${city.name}`);

      try {
        const data = await searchNearby(city.lat, city.lng, search.query);
        totalApiCalls++;

        const places = data.places || [];
        totalPlaces += places.length;

        console.log(`     Encontrados: ${places.length}`);

        for (const p of places) {
          const phone = cleanPhone(p.nationalPhoneNumber || p.internationalPhoneNumber);

          // Skip if no phone or already seen
          if (!phone || seenPhones.has(phone)) continue;
          seenPhones.add(phone);

          const lead = {
            source: 'google-maps',
            niche: search.niche,
            city: city.name,
            name: p.displayName?.text || 'Desconhecido',
            address: p.formattedAddress || '',
            phone: phone,
            phone_raw: p.nationalPhoneNumber || p.internationalPhoneNumber,
            website: p.websiteUri || null,
            google_maps: p.googleMapsUri || null,
            place_id: p.id,
            business_status: p.businessStatus || null,
            types: p.types || [],
            score: 80,
          };

          allLeads.push(lead);
          totalWithPhone++;
        }

        await sleep(200); // Rate limit
      } catch (err: any) {
        console.error(`     ❌ Error: ${err.message}`);
      }
    }
  }

  // Save results
  ensureDir(OUT);
  writeFileSync(OUT, JSON.stringify(allLeads, null, 2));

  ensureDir(LOG);
  appendFileSync(LOG, JSON.stringify({
    ts: new Date().toISOString(),
    api_calls: totalApiCalls,
    total_places: totalPlaces,
    unique_with_phone: totalWithPhone,
  }) + '\n');

  console.log(`\n🏁 DONE`);
  console.log(`   API calls: ${totalApiCalls}`);
  console.log(`   Total places: ${totalPlaces}`);
  console.log(`   Unique with phone: ${totalWithPhone}`);
  console.log(`   Arquivo: ${OUT}`);
  console.log(`   Custo estimado: $${(totalApiCalls * 0.025).toFixed(2)}`);
}

main().catch(console.error);
