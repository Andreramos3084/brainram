/**
 * STEP 3 ULTRA-ECONÔMICO — Scoring via Claude Batch API (50% OFF)
 *
 * Quando usar: quando você NÃO precisa do resultado na hora (ex: rodar de madrugada).
 * Trade-off: resposta em até 24h (geralmente <1h).
 *
 * Custo com Haiku + Batch: ~$0.60 por 1000 leads. Praticamente de graça.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM = `Você é analista de vendas B2B. Avalie fit para atendente WhatsApp IA (R$1.997 + R$397/mês).
Responda APENAS JSON: {"score":0-100,"motivo":"","gancho_pessoal":"","mensagem_cold":""}`;

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) throw new Error('Uso: bun run 3-score-batch.ts <leads-enriched.json>');

  const leads = JSON.parse(readFileSync(inputFile, 'utf-8'));
  console.log(`📦 Submetendo ${leads.length} leads em batch (50% off)...`);

  const requests = leads.map((lead: any, i: number) => ({
    custom_id: `lead_${i}`,
    params: {
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user' as const, content: `DADOS:\n${JSON.stringify(lead)}` }],
    },
  }));

  const batch = await client.messages.batches.create({ requests } as any);
  console.log(`📬 Batch ${batch.id} criado`);
  console.log(`⏳ Aguardando... (tipicamente 5-30min, max 24h)`);

  // Poll
  let result = batch;
  while (result.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 30_000));
    result = await client.messages.batches.retrieve(batch.id);
    console.log(`   status: ${result.processing_status} | done: ${result.request_counts.succeeded}/${leads.length}`);
  }

  // Download results
  const resultsStream = await client.messages.batches.results(batch.id);
  const scored = [...leads];

  for await (const item of resultsStream as any) {
    const idx = parseInt(item.custom_id.replace('lead_', ''));
    if (item.result.type === 'succeeded') {
      const txt = item.result.message.content[0].text;
      const match = txt.match(/\{[\s\S]*\}/);
      try {
        const parsed = JSON.parse(match[0]);
        scored[idx] = { ...scored[idx], ...parsed };
      } catch {
        scored[idx].score = 0;
      }
    }
  }

  scored.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
  const output = inputFile.replace('leads-enriched-', 'leads-scored-');
  writeFileSync(output, JSON.stringify(scored, null, 2));
  console.log(`✅ salvos em ${output}`);
}

main().catch(console.error);
