/**
 * DFY-IA MCP Server
 *
 * Expõe ferramentas de operação como MCP tools para Claude Code.
 * Permite que o André rode o motor com comandos naturais.
 *
 * Tools:
 *   - dfy_prospect: roda pipeline prospecção
 *   - dfy_send_outbound: dispara lote de outbound
 *   - dfy_list_leads: lista leads por status
 *   - dfy_metrics: dashboard resumido
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/home/guest/Área de trabalho/dfy-ia';

const server = new Server(
  { name: 'dfy-ia', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'dfy_prospect',
      description: 'Roda o pipeline completo de prospecção: scrape → enrich → score. Não envia.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nicho, ex: "clínica odontológica"' },
          city: { type: 'string' },
          limit: { type: 'number', default: 100 },
        },
        required: ['query', 'city'],
      },
    },
    {
      name: 'dfy_send_outbound',
      description: 'Dispara outbound WhatsApp do último lote pontuado. Use live=true pra enviar de verdade.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Caminho leads-scored-*.json' },
          live: { type: 'boolean', default: false },
        },
        required: ['file'],
      },
    },
    {
      name: 'dfy_list_leads',
      description: 'Lista leads ordenados por score (top 20) de um arquivo.',
      inputSchema: {
        type: 'object',
        properties: { file: { type: 'string' }, min_score: { type: 'number', default: 60 } },
        required: ['file'],
      },
    },
    {
      name: 'dfy_metrics',
      description: 'Dashboard rápido: envios hoje, respostas, calls agendadas, MRR.',
      inputSchema: { type: 'object', properties: {} },
    },

  ],
}));

function runCmd(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || out))));
  });
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    if (name === 'dfy_prospect') {
      const out = await runCmd(
        'bash',
        ['run.sh', args.query as string, args.city as string, String(args.limit || 100)],
        join(ROOT, 'prospeccao'),
      );
      return { content: [{ type: 'text', text: out }] };
    }

    if (name === 'dfy_send_outbound') {
      const flags = args.live ? ['--send'] : [];
      const out = await runCmd(
        'bun',
        ['run', 'scripts/4-send.ts', args.file as string, ...flags],
        join(ROOT, 'prospeccao'),
      );
      return { content: [{ type: 'text', text: out }] };
    }

    if (name === 'dfy_list_leads') {
      const leads = JSON.parse(readFileSync(args.file as string, 'utf-8'));
      const filtered = leads
        .filter((l: any) => l.score >= (args.min_score || 60))
        .slice(0, 20)
        .map((l: any) => `[${l.score}] ${l.name} — ${l.phone}\n  ${l.gancho_pessoal}`)
        .join('\n\n');
      return { content: [{ type: 'text', text: filtered || 'nenhum lead acima do threshold' }] };
    }

    if (name === 'dfy_metrics') {
      const log = join(ROOT, 'prospeccao/data/send-log.jsonl');
      let sent = 0;
      try {
        const lines = readFileSync(log, 'utf-8').trim().split('\n');
        const today = new Date().toISOString().split('T')[0];
        sent = lines.filter((l) => l.includes(today) && l.includes('"sent"')).length;
      } catch {}
      return { content: [{ type: 'text', text: `📊 Envios hoje: ${sent}\n⏳ resposta/call/MRR: conectar Supabase` }] };
    }

    return { content: [{ type: 'text', text: `tool desconhecida: ${name}` }], isError: true };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `erro: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('DFY-IA MCP server ativo');
