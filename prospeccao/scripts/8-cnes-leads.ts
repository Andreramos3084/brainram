/**
 * CNES Lead Extractor — Dados Abertos do Governo Brasileiro
 * Busca estabelecimentos de saúde por município e tipo.
 *
 * Uso: bun run 8-cnes-leads.ts
 * Não requer API key — dados públicos do DataSUS
 *
 * Tipos de unidade CNES comuns:
 *   22 = Consultório Odontológico
 *   36 = Clínica/Centro de Especialidade
 *   39 = Laboratório de Saúde Pública
 *   61 = Centro de Imagem
 *   62 = Centro de Radioterapia
 *   73 = Serviço de Atendimento Domiciliar
 *
 * Códigos IBGE de municípios:
 *   355030 = São Paulo
 *   330455 = Rio de Janeiro
 *   310620 = Belo Horizonte
 *   410690 = Curitiba
 *   431490 = Porto Alegre
 *   530010 = Brasília
 *   350950 = Campinas
 *   292740 = Salvador
 *   230440 = Fortaleza
 *   420540 = Florianópolis
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const BASE_URL = 'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const OUT = 'data/cnes-leads.json';
const LOG = 'data/cnes-log.jsonl';

// Configuração: municípios + tipos de unidade por nicho
const CONFIG = [
  {
    niche: 'Odontologia',
    tipos: [22], // Consultório Odontológico
    cidades: [
      { nome: 'São Paulo', ibge: 355030 },
      { nome: 'Rio de Janeiro', ibge: 330455 },
      { nome: 'Belo Horizonte', ibge: 310620 },
      { nome: 'Curitiba', ibge: 410690 },
      { nome: 'Porto Alegre', ibge: 431490 },
      { nome: 'Brasília', ibge: 530010 },
      { nome: 'Campinas', ibge: 350950 },
      { nome: 'Salvador', ibge: 292740 },
      { nome: 'Fortaleza', ibge: 230440 },
      { nome: 'Florianópolis', ibge: 420540 },
    ],
  },
  {
    niche: 'Laboratório de Exames',
    tipos: [39, 36], // Laboratório + Clínica de Especialidade
    cidades: [
      { nome: 'São Paulo', ibge: 355030 },
      { nome: 'Rio de Janeiro', ibge: 330455 },
      { nome: 'Belo Horizonte', ibge: 310620 },
      { nome: 'Curitiba', ibge: 410690 },
      { nome: 'Porto Alegre', ibge: 431490 },
    ],
  },
  {
    niche: 'Centro de Imagem',
    tipos: [61, 36], // Centro de Imagem + Clínica
    cidades: [
      { nome: 'São Paulo', ibge: 355030 },
      { nome: 'Rio de Janeiro', ibge: 330455 },
      { nome: 'Belo Horizonte', ibge: 310620 },
      { nome: 'Curitiba', ibge: 410690 },
      { nome: 'Porto Alegre', ibge: 431490 },
    ],
  },
  {
    niche: 'Medicina',
    tipos: [36, 73], // Clínica/Especialidade + Atendimento Domiciliar
    cidades: [
      { nome: 'São Paulo', ibge: 355030 },
      { nome: 'Rio de Janeiro', ibge: 330455 },
      { nome: 'Belo Horizonte', ibge: 310620 },
      { nome: 'Curitiba', ibge: 410690 },
      { nome: 'Porto Alegre', ibge: 431490 },
    ],
  },
];

async function fetchEstabelecimentos(ibge: number, tipo: number | null, offset: number = 0, limit: number = 20): Promise<any[]> {
  const url = new URL(BASE_URL);
  url.searchParams.append('codigo_municipio', String(ibge));
  if (tipo) url.searchParams.append('codigo_tipo_unidade', String(tipo));
  url.searchParams.append('limit', String(limit));
  url.searchParams.append('offset', String(offset));

  const r = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (BrainRam Lead Extractor)',
      'Accept': 'application/json',
    },
  });

  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`CNES API error ${r.status}: ${err.slice(0, 200)}`);
  }

  const data = await r.json();
  return data.estabelecimentos || [];
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function cleanPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  // Adiciona DDD 11 se tiver apenas 8-9 dígitos (SP padrão)
  if (digits.length <= 9) return '11' + digits;
  return digits;
}

async function main() {
  const allLeads: any[] = [];
  const seenPhones = new Set<string>();
  let totalFetched = 0;
  let totalWithContact = 0;

  for (const config of CONFIG) {
    console.log(`\n🔍 [${config.niche}] Buscando...`);

    for (const cidade of config.cidades) {
      for (const tipo of config.tipos) {
        console.log(`  📍 ${cidade.nome} (tipo ${tipo})`);

        let offset = 0;
        const limit = 20;
        let hasMore = true;
        let pageCount = 0;

        while (hasMore && pageCount < 50) { // Max 50 páginas = 1000 estabelecimentos
          try {
            const ests = await fetchEstabelecimentos(cidade.ibge, tipo, offset, limit);
            totalFetched += ests.length;

            if (ests.length === 0) {
              hasMore = false;
              break;
            }

            for (const e of ests) {
              const nome = e.nome_fantasia || e.nome_razao_social || 'Desconhecido';
              const phoneRaw = e.numero_telefone_estabelecimento || null;
              const email = e.endereco_email_estabelecimento || null;
              const phone = cleanPhone(phoneRaw);

              // Skip if no contact info
              if (!phone && !email) continue;

              // Deduplicate by phone
              if (phone && seenPhones.has(phone)) continue;
              if (phone) seenPhones.add(phone);

              const lead = {
                source: 'cnes',
                niche: config.niche,
                city: cidade.nome,
                name: nome,
                address: `${e.endereco_estabelecimento || ''}, ${e.numero_estabelecimento || ''} - ${e.bairro_estabelecimento || ''}`,
                phone: phone,
                email: email,
                cep: e.codigo_cep_estabelecimento || null,
                cnes_id: e.codigo_cnes || null,
                cnes_code: e.codigo_estabelecimento_saude || null,
                tipo_unidade: e.codigo_tipo_unidade || tipo,
                turno: e.descricao_turno_atendimento || null,
                atende_sus: e.estabelecimento_faz_atendimento_ambulatorial_sus || null,
                data_atualizacao: e.data_atualizacao || null,
                score: 75,
              };

              allLeads.push(lead);
              totalWithContact++;
            }

            console.log(`     Página ${pageCount + 1}: ${ests.length} estabelecimentos`);

            offset += limit;
            pageCount++;
            await sleep(500); // Rate limit

          } catch (err: any) {
            console.error(`     ❌ Error: ${err.message}`);
            hasMore = false;
          }
        }
      }
    }
  }

  // Salvar resultados
  ensureDir(OUT);
  writeFileSync(OUT, JSON.stringify(allLeads, null, 2));

  ensureDir(LOG);
  appendFileSync(LOG, JSON.stringify({
    ts: new Date().toISOString(),
    total_fetched: totalFetched,
    total_with_contact: totalWithContact,
    unique_leads: allLeads.length,
    with_phone: allLeads.filter(l => l.phone).length,
    with_email: allLeads.filter(l => l.email).length,
    with_both: allLeads.filter(l => l.phone && l.email).length,
  }) + '\n');

  console.log(`\n🏁 DONE`);
  console.log(`   Total buscado na API: ${totalFetched}`);
  console.log(`   Com contato (tel/email): ${totalWithContact}`);
  console.log(`   Leads únicos: ${allLeads.length}`);
  console.log(`   Com telefone: ${allLeads.filter(l => l.phone).length}`);
  console.log(`   Com email: ${allLeads.filter(l => l.email).length}`);
  console.log(`   Com ambos: ${allLeads.filter(l => l.phone && l.email).length}`);
  console.log(`   Arquivo: ${OUT}`);
}

main().catch(console.error);
