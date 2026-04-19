/**
 * API — Hono server
 * Endpoints de scraping para o pipeline principal consumir.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { scrapeQueue, enrichQueue } from '../queue/queue.js';
import { supabase } from '../storage/supabase.js';

const app = new Hono();

// auth middleware (API key simples)
app.use('/v1/*', async (c, next) => {
  const key = c.req.header('x-api-key');
  if (!key || key !== process.env.SCRAPER_API_KEY) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

app.get('/v1/health', async (c) => {
  const scrapeWaiting = await scrapeQueue.getWaitingCount();
  const scrapeActive = await scrapeQueue.getActiveCount();
  const enrichWaiting = await enrichQueue.getWaitingCount();
  return c.json({
    ok: true,
    uptime: process.uptime(),
    queues: {
      scrape: { waiting: scrapeWaiting, active: scrapeActive },
      enrich: { waiting: enrichWaiting },
    },
  });
});

const ScrapeReq = z.object({
  query: z.string().min(2),
  city: z.string().min(2),
  limit: z.number().int().min(1).max(500).default(100),
});

app.post('/v1/scrape/google-maps', async (c) => {
  const body = await c.req.json();
  const parsed = ScrapeReq.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const job = await scrapeQueue.add('google-maps', parsed.data);
  return c.json({ jobId: job.id }, 202);
});

const EnrichReq = z.object({
  leads: z.array(z.object({
    id: z.string().optional(),
    instagramHandle: z.string().optional(),
    websiteUrl: z.string().optional(),
  })),
});

app.post('/v1/enrich', async (c) => {
  const body = await c.req.json();
  const parsed = EnrichReq.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const jobs = [];
  for (const lead of parsed.data.leads) {
    if (lead.instagramHandle) {
      const j = await enrichQueue.add('instagram', { type: 'instagram', handle: lead.instagramHandle, leadId: lead.id });
      jobs.push(j.id);
    }
    if (lead.websiteUrl) {
      const j = await enrichQueue.add('website', { type: 'website', url: lead.websiteUrl, leadId: lead.id });
      jobs.push(j.id);
    }
  }
  return c.json({ jobIds: jobs }, 202);
});

app.get('/v1/job/:queue/:id', async (c) => {
  const queueName = c.req.param('queue');
  const id = c.req.param('id');
  const queue = queueName === 'scrape' ? scrapeQueue : enrichQueue;
  const job = await queue.getJob(id);
  if (!job) return c.json({ error: 'not found' }, 404);
  const state = await job.getState();
  return c.json({
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  });
});

app.get('/v1/leads', async (c) => {
  const query = c.req.query('query');
  const city = c.req.query('city');
  const limit = Number(c.req.query('limit') || 100);
  let q = supabase.from('scraper_leads').select('*').limit(limit).order('created_at', { ascending: false });
  if (query) q = q.ilike('query', `%${query}%`);
  if (city) q = q.ilike('city', `%${city}%`);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ leads: data });
});

const port = Number(process.env.PORT || 3030);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Scraper Engine API em http://0.0.0.0:${info.port}`);
});
