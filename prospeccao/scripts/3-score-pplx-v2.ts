/**
 * Score v2 — favorece solo/MEI (onde dentista=atende WhatsApp).
 * Uso: bun run 3-score-pplx-v2.ts <leads-raw.json>
 * Env: PERPLEXITY_KEY
 */
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.PERPLEXITY_KEY!;

const SYSTEM = `Analista B2B BrainRam. Produto: atendente WhatsApp IA pra clínica odonto (R$297-497/mês, 7d trial).

OBJETIVO: priorizar clínicas onde o(a) DONO(A)/DENTISTA atende o próprio WhatsApp — não recepcionista.

Score 0-100:
- ALTO (85-100): solo, MEI, "Dr./Dra. [nome]" no título, 1 endereço, aparenta pequeno porte, sem palavras "unidade/rede/filial"
- MÉDIO (60-84): clínica pequena 2-3 dentistas, sem franquia
- BAIXO (0-59): rede grande, "unidade X", franquia (OralSin, Sorridents, Orthopride etc), 4+ profissionais listados, multiunit

Gere mensagem cold WhatsApp 4-5 linhas tratando quem responde como PORTEIRO (pode ser recepção) — pede pra passar pro responsável OU melhor horário. Assine "BrainRam". NÃO prometa resultado.

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
  if (!file) throw new Error('uso: bun run 3-score-pplx-v2.ts <raw.json>');
  const leads = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`🎯 score v2 (solo/MEI filter) — ${leads.length} leads`);
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
  const outFile = file.replace(/\.json$/, '-v2.json');
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  const h = out.filter(l => l.score >= 80).length;
  const m = out.filter(l => l.score >= 60 && l.score < 80).length;
  console.log(`\n✅ top 10:`);
  out.slice(0, 10).forEach((l, i) => console.log(`  ${i+1}. [${l.score}] ${l.name} — ${l.city}`));
  console.log(`\n💾 ${outFile}`);
  console.log(`🎯 ${h} alto (>=80) · ${m} médio (60-79)`);
}
main().catch(console.error);
