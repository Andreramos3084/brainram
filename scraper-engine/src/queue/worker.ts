/**
 * Worker — consome a fila e executa scrapers
 *
 * Rodar em container separado do API server.
 * Escalável horizontalmente: subir N workers.
 */

import { Worker } from 'bullmq';
import { connection } from './queue.js';
import { scrapeGoogleMaps } from '../scrapers/google-maps.js';
import { scrapeInstagram } from '../scrapers/instagram.js';
import { analyzeWebsite } from '../scrapers/website-signals.js';
import { saveLeads, saveEnrichment } from '../storage/supabase.js';

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);

const scrapeWorker = new Worker(
  'scrape',
  async (job) => {
    const { query, city, limit } = job.data;
    console.log(`🔍 [${job.id}] scrape ${query} @ ${city} (limit ${limit})`);

    const leads = await scrapeGoogleMaps(query, city, limit, async (n, total) => {
      await job.updateProgress({ current: n, total });
    });

    await saveLeads(leads.map((l) => ({ ...l, job_id: job.id, query, city })));
    return { count: leads.length, query, city };
  },
  { connection, concurrency: CONCURRENCY },
);

const enrichWorker = new Worker(
  'enrich',
  async (job) => {
    const { type, handle, url, leadId } = job.data;
    console.log(`🔬 [${job.id}] enrich ${type} ${handle || url}`);

    let result: any = {};
    if (type === 'instagram' && handle) result = await scrapeInstagram(handle);
    if (type === 'website' && url) result = await analyzeWebsite(url);

    if (leadId) await saveEnrichment(leadId, type, result);
    return result;
  },
  { connection, concurrency: CONCURRENCY * 2 },
);

scrapeWorker.on('completed', (job) => console.log(`✅ scrape ${job.id} done`));
scrapeWorker.on('failed', (job, err) => console.error(`❌ scrape ${job?.id}: ${err.message}`));
enrichWorker.on('failed', (job, err) => console.error(`❌ enrich ${job?.id}: ${err.message}`));

console.log(`🏭 Workers online (concurrency: ${CONCURRENCY})`);
