/**
 * Variante queue.ts usando Upstash Redis Free (10k commands/dia grátis)
 *
 * Trocar pelo queue.ts original se preferir SaaS ao invés de Redis self-hosted.
 * Vantagem: não ocupa memória da Oracle VM. Desvantagem: latência maior.
 *
 * Setup:
 *   1. upstash.com → criar DB Redis (região São Paulo se existir, senão US East)
 *   2. Copiar REST URL + token
 *   3. Setar UPSTASH_REDIS_URL=redis://default:TOKEN@HOST:PORT
 */

import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: REDIS_URL.startsWith('rediss://') ? {} : undefined,
});

export const scrapeQueue = new Queue('scrape', { connection });
export const enrichQueue = new Queue('enrich', { connection });
export const scrapeEvents = new QueueEvents('scrape', { connection });
export const enrichEvents = new QueueEvents('enrich', { connection });
