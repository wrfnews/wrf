import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/202610110001_wrf_foundation.sql', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('all WRF application tables enable row-level security', () => {
  for (const table of ['wrf_countries','wrf_sources','wrf_indicators','wrf_indicator_values','wrf_value_versions','wrf_user_roles','wrf_audit_log','wrf_review_requests']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} must enable RLS`);
  }
});
test('anonymous users cannot write to WRF tables', () => {
  assert.match(sql, /revoke insert, update, delete on public\\.wrf_countries, public\\.wrf_sources, public\\.wrf_indicators, public\\.wrf_indicator_values from anon/i);
});
test('role table has no client-side mutation grant', () => {
  assert.match(sql, /revoke all on public\\.wrf_user_roles from anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\\s+(?:insert|update|delete|all)\\s+on\\s+public\\.wrf_user_roles\\s+to\\s+authenticated/i);
});
test('publishing is only available through the protected review RPC', () => {
  assert.match(sql, /create or replace function public\\.wrf_review_value/i);
  assert.match(sql, /revoke all on function public\\.wrf_review_value\\(uuid, text, text\\) from public, anon/i);
  assert.match(sql, /grant execute on function public\\.wrf_review_value\\(uuid, text, text\\) to authenticated/i);
  assert.match(sql, /An approved source is required before publication/i);
  assert.match(sql, /Reviewers cannot review their own submission/i);
  assert.doesNotMatch(sql, /create policy wrf_values_reviewer_update on public\\.wrf_indicator_values for update/i);
});
test('review decisions are recorded and auditable', () => {
  assert.match(sql, /insert into public\\.wrf_review_requests/i);
  assert.match(sql, /value\\.reviewed/i);
  assert.match(sql, /create trigger wrf_value_history after insert or update on public\\.wrf_indicator_values/i);
});
test('PL/pgSQL functions use a single declaration section per block', () => {
  assert.doesNotMatch(sql, /declare\\s+[^;]+;\\s*declare\\s+/i);
});
test('submitted values must enter the review queue as pending', () => {
  assert.ok(sql.includes("with check (status = 'pending' and submitted_by = (select auth.uid()));"));
  assert.doesNotMatch(sql, /with check \\(status in \\('pending','in_review'\\)/i);
});
test('review RPC rejects a missing decision', () => {
  assert.match(sql, /if p_decision is null or p_decision not in/i);
});
test('public site exposes atlas, compare, map, and data sections without invented metrics', () => {
  for (const section of ['id="explore"', 'id="compare"', 'id="map"', 'id="data"', 'id="sources"']) assert.ok(app.includes(section), `Missing ${section}`);
  assert.match(app, /No statistics are fabricated for this preview/i);
  assert.match(app, /No source, no verified fact\\./i);
});
test('country profiles only query and display published values with evidence links', () => {
  assert.match(app, /\\.eq\\('status', 'published'\\)/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /View evidence/);
  assert.match(app, /No published indicator values are available for this country yet/);
});
test('deployment configs build the static Vite site with baseline security headers', async () => {
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  const netlify = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(vercel, /"buildCommand": "npm run build"/);
  assert.match(vercel, /"outputDirectory": "dist"/);
  assert.match(vercel, /X-Content-Type-Options/);
  assert.match(netlify, /publish = "dist"/);
  assert.match(netlify, /Referrer-Policy/);
  assert.match(html, /\\/wrf-mark\\.svg/);
  assert.doesNotMatch(html, /worldrevealedfact\\.example/);
});
