/**
 * STEP 2 — Enriquecimento via Perplexity
 *
 * Input:  prospeccao/data/leads-raw-*.json
 * Output: prospeccao/data/leads-enriched-*.json
 *
 * Para cada lead: pesquisa Instagram, posts recentes, se anuncia, sinais de atividade.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';

const PERPLEXITY_KEY = process.env.PERPLEXITY_KEY!;

async function enrich(lead: any): Promise<any> {
  const query = `Pesquise sobre a clínica "${lead.name}" em ${lead.address || ''}. Retorne em JSON:
- instagram_handle (se houver)
- tem_instagram_ativo (posts últimos 30 dias? true/false)
- numero_posts_ultimo_mes (estimativa)
- anuncia_google_ads (provável? true/false/unknown)
- tem_site (true/false)
- tem_sistema_agendamento_online (true/false/unknown)
- porte_estimado (pequeno/medio/grande)
- sinais_atividade (último review? post? pista de atividade)
- observacao_util (algo real pra usar numa abordagem comercial)

Responda APENAS o JSON, sem markdown.`;

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PERPLEXITY_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: query }],
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    console.warn(`⚠ enrich failed for ${lead.name}: ${res.status}`);
    return { ...lead, enrichment: null };
  }

  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || '{}';
  const match = txt.match(/\{[\s\S]*\}/);
  let enrichment = {};
  try {
    enrichment = match ? JSON.parse(match[0]) : {};
  } catch {
    enrichment = { raw: txt };
  }
  return { ...lead, enrichment };
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) throw new Error('Uso: bun run 2-enrich.ts <leads-raw-file.json>');

  const leads = JSON.parse(readFileSync(inputFile, 'utf-8'));
  console.log(`🔬 Enriquecendo ${leads.length} leads...`);

  const enriched = [];
  for (let i = 0; i < leads.length; i++) {
    console.log(`  [${i + 1}/${leads.length}] ${leads[i].name}`);
    enriched.push(await enrich(leads[i]));
    await new Promise((r) => setTimeout(r, 1500));
  }

  const output = inputFile.replace('leads-raw-', 'leads-enriched-');
  writeFileSync(output, JSON.stringify(enriched, null, 2));
  console.log(`✅ salvos em ${output}`);
}

main().catch(console.error);
