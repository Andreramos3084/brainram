import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async () => {
  const vars = {
    PERPLEXITY_KEY: Deno.env.get('PERPLEXITY_KEY') ? 'SET' : 'MISSING',
    PERPLEXITY_API_KEY: Deno.env.get('PERPLEXITY_API_KEY') ? 'SET' : 'MISSING',
    ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY') ? 'SET' : 'MISSING',
    SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? 'SET' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING',
  };
  return Response.json(vars);
});
