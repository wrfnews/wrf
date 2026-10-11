import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null;

export type Country = {
  id: string; iso3: string; name: string; capital: string | null;
  continent: string | null; created_at: string; updated_at: string;
};
export type PublishedFact = {
  id: string; numeric_value: number | null; text_value: string | null;
  reference_year: number; evidence_url: string; status: 'published';
  wrf_countries: { name: string; iso3: string } | null;
  wrf_indicators: { name: string; unit: string | null; code: string } | null;
  wrf_sources: { name: string; source_url: string } | null;
};
