/**
 * Enrich só email+website via pplx. Entrada: scored.json. Saída: scored-with-email.json.
 * Uso: bun run 2b-enrich-email.ts <file.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.PERPLEXITY_KEY!;

async function findEmail(lead: any) {
  const q = `Ache o email de contato público e o site da clínica odontológica "${lead.name}" em ${lead.city}, Brasil (endereço: ${lead.address}). Retorne APENAS JSON: {"email":"...","website":"..."}. Se não encontrar, use string vazia. Não invente.`;
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar', messages: [{ role: 'user', content: q }],
      max_tokens: 200, temperature: 0,
    }),
  });
  if (!r.ok) return { email: '', website: '' };
  const d = await r.json();
  const txt = d.choices?.[0]?.message?.content || '';
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return { email: '', website: '' };
  try {
    const parsed = JSON.parse(m[0]);
    const email = String(parsed.email || '').trim();
    const website = String(parsed.website || '').trim();
    // sanity: email deve ter @ e . depois
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
    return { email: validEmail, website };
  } catch { return { email: '', website: '' }; }
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('uso: bun run 2b-enrich-email.ts <file.json>');
  const leads = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`📧 enriquecendo email pra ${leads.length} leads...`);
  const out: any[] = [];
  const BATCH = 5;
  for (let i = 0; i < leads.length; i += BATCH) {
    const chunk = leads.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map(findEmail));
    chunk.forEach((l: any, idx: number) => {
      const r = results[idx];
      console.log(`  [${i+idx+1}/${leads.length}] ${l.name} → ${r.email || '(sem email)'}`);
      out.push({ ...l, email: r.email, website: r.website || l.website });
    });
    await new Promise(r => setTimeout(r, 500));
  }
  const outFile = file.replace(/\.json$/, '-with-email.json');
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  const withEmail = out.filter(l => l.email).length;
  console.log(`\n💾 ${outFile}`);
  console.log(`📧 ${withEmail}/${out.length} com email (${(withEmail/out.length*100).toFixed(0)}%)`);
}
main().catch(console.error);
