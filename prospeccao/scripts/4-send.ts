/**
 * STEP 4 — Envio via Evolution API
 *
 * Input:  leads-scored-*.json
 * Output: logs de envio + fila de resposta
 *
 * SAFETY:
 * - Só envia se score >= 60
 * - Máx 50 envios/número/dia
 * - Rotaciona 3 números
 * - Delay randômico 2-4min entre mensagens
 * - Janela horário: 9h-12h / 14h-18h dias úteis
 * - Dry-run por padrão: passar --send para enviar de verdade
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EVO_URL = process.env.EVOLUTION_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;
const INSTANCES = (process.env.EVOLUTION_INSTANCES || 'outbound1,outbound2,outbound3').split(',');

const LIMIT_PER_INSTANCE = 50;
const DELAY_MIN_MS = 120_000;
const DELAY_MAX_MS = 240_000;
const SCORE_CUT = 60;

const LOG_FILE = join(import.meta.dir, '..', 'data', 'send-log.jsonl');

interface Lead {
  name: string;
  phone: string;
  score: number;
  mensagem_cold: string;
}

function isBusinessHour(): boolean {
  const now = new Date();
  const day = now.getDay();
  const h = now.getHours();
  if (day === 0) return false;
  if (day === 6) return h >= 10 && h < 14;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return '55' + digits;
}

async function sendOne(instance: string, phone: string, message: string): Promise<any> {
  const res = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!res.ok) throw new Error(`send failed ${res.status}: ${await res.text()}`);
  return res.json();
}

function logEvent(event: any) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
  const fs = require('node:fs');
  fs.appendFileSync(LOG_FILE, line);
}

async function main() {
  const inputFile = process.argv[2];
  const dryRun = !process.argv.includes('--send');
  if (!inputFile) throw new Error('Uso: bun run 4-send.ts <leads-scored.json> [--send]');

  const leads: Lead[] = JSON.parse(readFileSync(inputFile, 'utf-8'))
    .filter((l: Lead) => l.score >= SCORE_CUT && l.phone && l.mensagem_cold);

  console.log(`📤 ${leads.length} leads qualificados para envio (score>=${SCORE_CUT}) ${dryRun ? '[DRY-RUN]' : '[LIVE]'}`);

  const max = INSTANCES.length * LIMIT_PER_INSTANCE;
  const batch = leads.slice(0, max);

  for (let i = 0; i < batch.length; i++) {
    if (!dryRun && !isBusinessHour()) {
      console.log('⏰ fora do horário comercial, aguardando...');
      await new Promise((r) => setTimeout(r, 60_000));
      i--; continue;
    }

    const lead = batch[i];
    const instance = INSTANCES[i % INSTANCES.length];
    const phone = normalizePhone(lead.phone);

    console.log(`\n[${i + 1}/${batch.length}] ${lead.name} (score ${lead.score}) via ${instance}`);
    console.log(`  → ${phone}`);
    console.log(`  msg: ${lead.mensagem_cold.slice(0, 100)}...`);

    if (dryRun) {
      logEvent({ type: 'dry_run', lead: lead.name, phone, instance });
      continue;
    }

    try {
      const res = await sendOne(instance, phone, lead.mensagem_cold);
      logEvent({ type: 'sent', lead: lead.name, phone, instance, ok: true, id: res?.key?.id });
      console.log(`  ✅ enviado`);
    } catch (e: any) {
      logEvent({ type: 'error', lead: lead.name, phone, instance, error: e.message });
      console.log(`  ❌ erro: ${e.message}`);
    }

    const delay = DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
    console.log(`  ⏳ aguardando ${Math.round(delay / 1000)}s`);
    await new Promise((r) => setTimeout(r, delay));
  }

  console.log(`\n🏁 Concluído. Log: ${LOG_FILE}`);
}

main().catch(console.error);
