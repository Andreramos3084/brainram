/**
 * Score rápido via Perplexity sonar. Pula enrich — score no raw.
 * Uso: bun run 3-score-pplx-fast.ts <leads-raw.json>
 * Env: PERPLEXITY_KEY
 */
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.PERPLEXITY_KEY!;

const SYSTEM = `Analista B2B BrainRam. Produto: atendente WhatsApp IA pra clínica (R$297-497/mês, 7d trial grátis).
Score 0-100: clínica pequena/média ativa no WA = alto. Inativa/grande demais = baixo.
Gere mensagem cold WhatsApp 4-6 linhas, humana, consultiva, SEM prometer resultado, com pergunta curta no fim. Assine apenas como "BrainRam".
Retorne APENAS JSON: {"score":0-100,"motivo":"1 linha","mensagem_cold":"..."}`;

async function scoreOne(lead: any) {
  const user = `${lead.name} — ${lead.city || ''} — ${lead.phone} — ${lead.address || ''} ${lead.website ? '— site: '+lead.website : ''}`;
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      max_tokens: 400, temperature: 0.2,
    }),
  });
  if (!r.ok) return { score: 0, motivo: `http ${r.status}`, mensagem_cold: '' };
  const d = await r.json();
  const txt = d.choices?.[0]?.message?.content || '';
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return { score: 0, motivo: 'no json', mensagem_cold: '' };
  try { return JSON.parse(m[0]); } catch { return { score: 0, motivo: 'parse fail', mensagem_cold: '' }; }
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('uso: bun run 3-score-pplx-fast.ts <raw.json>');
  const leads = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`🎯 score ${leads.length} leads via pplx sonar...`);
  const out: any[] = [];
  const BATCH = 6;
  for (let i = 0; i < leads.length; i += BATCH) {
    const chunk = leads.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map(scoreOne));
    chunk.forEach((l: any, idx: number) => {
      const r = results[idx];
      console.log(`  [${i+idx+1}/${leads.length}] ${l.name} (${l.city}) → ${r.score}`);
      out.push({ ...l, ...r });
    });
    await new Promise(r => setTimeout(r, 500));
  }
  out.sort((a, b) => (b.score || 0) - (a.score || 0));
  const outFile = file.replace('leads-raw-', 'leads-scored-');
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  const qual = out.filter(l => l.score >= 60).length;
  console.log(`\n✅ top 10:`);
  out.slice(0, 10).forEach((l, i) => console.log(`  ${i+1}. [${l.score}] ${l.name} — ${l.city}`));
  console.log(`\n💾 ${outFile}`);
  console.log(`🎯 ${qual} leads score>=60`);
}

main().catch(console.error);
