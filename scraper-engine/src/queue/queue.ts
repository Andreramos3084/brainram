import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const scrapeQueue = new Queue('scrape', { connection });
export const enrichQueue = new Queue('enrich', { connection });

export const scrapeEvents = new QueueEvents('scrape', { connection });
export const enrichEvents = new QueueEvents('enrich', { connection });

export interface ScrapeJob {
  type: 'google-maps';
  query: string;
  city: string;
  limit: number;
}

export interface EnrichJob {
  type: 'instagram' | 'website';
  handle?: string;
  url?: string;
  leadId?: string;
}
