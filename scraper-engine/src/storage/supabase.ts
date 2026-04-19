import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function saveLeads(leads: any[]) {
  if (leads.length === 0) return;
  const { error } = await supabase.from('scraper_leads').upsert(leads, { onConflict: 'mapsUrl' });
  if (error) console.error('saveLeads error:', error.message);
}

export async function saveEnrichment(leadId: string, type: string, data: any) {
  const col = type === 'instagram' ? 'instagram' : 'website';
  const { error } = await supabase.from('scraper_leads').update({ [col]: data }).eq('id', leadId);
  if (error) console.error('saveEnrichment error:', error.message);
}
