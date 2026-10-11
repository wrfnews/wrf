import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/202610110001_wrf_foundation.sql', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('all WRF application tables enable row-level security', () => {
  for (const table of ['wrf_countries','wrf_sources','wrf_indicators','wrf_indicator_values','wrf_value_versions','wrf_user_roles','wrf_audit_log','wrf_review_requests']) {
    assert.ok(sql.includes('alter table public.' + table + ' enable row level security'), table + ' must enable RLS');
  }
});
test('anonymous users cannot write to WRF tables', () => {
  assert.ok(sql.includes('revoke insert, update, delete on public.wrf_countries, public.wrf_sources, public.wrf_indicators, public.wrf_indicator_values from anon'));
});
test('role table has no client-side mutation grant', () => {
  assert.ok(sql.includes('revoke all on public.wrf_user_roles from anon, authenticated'));
  assert.ok(!sql.includes('grant insert, update, delete on public.wrf_user_roles to authenticated'));
});
test('publishing is only available through the protected review RPC', () => {
  assert.ok(sql.includes('create or replace function public.wrf_review_value'));
  assert.ok(sql.includes('revoke all on function public.wrf_review_value(uuid, text, text) from public, anon'));
  assert.ok(sql.includes('grant execute on function public.wrf_review_value(uuid, text, text) to authenticated'));
  assert.ok(sql.includes('An approved source is required before publication'));
  assert.ok(sql.includes('Reviewers cannot review their own submission'));
  assert.ok(!sql.includes('create policy wrf_values_reviewer_update on public.wrf_indicator_values for update'));
});
test('review decisions are recorded and auditable', () => {
  assert.ok(sql.includes('insert into public.wrf_review_requests'));
  assert.ok(sql.includes('value.reviewed'));
  assert.ok(sql.includes('create trigger wrf_value_history after insert or update on public.wrf_indicator_values'));
});
test('PL/pgSQL functions use a single declaration section per block', () => {
  assert.ok(!/declare\s+[^;]+;\s*declare\s+/i.test(sql));
});
test('submitted values must enter the review queue as pending', () => {
  assert.ok(sql.includes("with check (status = 'pending' and submitted_by = (select auth.uid()));"));
  assert.ok(!sql.includes("with check (status in ('pending','in_review')"));
});
test('review RPC rejects a missing decision', () => {
  assert.ok(sql.includes('if p_decision is null or p_decision not in'));
});
test('public site exposes atlas, compare, map, and data sections without invented metrics', () => {
  for (const section of ['id="explore"', 'id="compare"', 'id="map"', 'id="data"', 'id="sources"']) assert.ok(app.includes(section), 'Missing ' + section);
  assert.ok(app.includes('No statistics are fabricated for this preview'));
  assert.ok(app.includes('No source, no verified fact.'));
});
test('country profiles only query and display published values with evidence links', () => {
  assert.ok(app.includes(".eq('status', 'published')"));
  assert.ok(app.includes('aria-modal="true"'));
  assert.ok(app.includes('View evidence'));
  assert.ok(app.includes('No published indicator values are available for this country yet'));
});
test('deployment configs build the static Vite site with baseline security headers', async () => {
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  const netlify = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(vercel.includes('"buildCommand": "npm run build"'));
  assert.ok(vercel.includes('"outputDirectory": "dist"'));
  assert.ok(vercel.includes('X-Content-Type-Options'));
  assert.ok(netlify.includes('publish = "dist"'));
  assert.ok(netlify.includes('Referrer-Policy'));
  assert.ok(html.includes('/wrf-mark.svg'));
  assert.ok(!html.includes('worldrevealedfact.example'));
});
