# World Revealed Fact (WRF) — Foundation Starter

**Tagline:** Reveal the World. Verify the Facts.

WRF is a source-led world atlas foundation. Its rule is **“No source, no verified fact.”** The public interface is deployed, but the product is not production-complete until the database, Founder access, real data, and end-to-end checks are verified.

## Current scope

- React + Vite public website: country atlas, search/filter, evidence-first country profiles, and clearly labelled placeholders for comparison/map/catalogue features.
- Supabase foundation migration with Row Level Security, source approval, published-value-only public reads, review RPC, history snapshots, and audit records.
- A manual first-Founder bootstrap script. It deliberately does **not** promote the first person who signs up.
- No invented country statistics. An empty atlas is expected until reviewed records are added.

## Setup Supabase safely

1. Open the Supabase project named `world-revealed-fact` and check that it is the correct project.
2. In **SQL Editor**, open and run `supabase/migrations/202610110001_wrf_foundation.sql`. Run it in a development project first. Confirm it completes without errors.
3. In Supabase **Authentication**, create/sign up the exact account intended to own WRF Founder access. Use an email you control.
4. Open `supabase/bootstrap/001_first_founder.sql`, replace `REPLACE_WITH_EXACT_FOUNDER_EMAIL` with that exact email, inspect the script, and run it in the Supabase SQL Editor as project owner. Do not expose this operation as a public endpoint. The script aborts if the account is missing or already has a role.
5. In Supabase **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy anon key if the project only exposes that). Never use the service-role/secret key in browser code.
6. In Vercel project settings for `world-revealed-fact`, add these environment variables for **Production, Preview, and Development**:
   - `VITE_SUPABASE_URL` = the Supabase Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable/anon key
7. Redeploy the Vercel project after setting variables. Then check that the atlas reads country rows and that only published values appear publicly.

## Local development

1. Install Node.js 20+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the two public Supabase connection values.
4. Run `npm run test:security`, `npm run typecheck`, and `npm run build`.
5. Verify the migration and review workflow in a separate development Supabase project before using real production data.

## Security and production checklist

- Never put a Supabase service-role key in frontend code or any `VITE_*` variable.
- Do not let browser signup assign roles; Founder promotion is a manual SQL Editor operation until a separately audited server-side admin flow exists.
- Public facts must be published, dated, and traceable to an evidence URL and approved source.
- Test anonymous reads, submitter permissions, reviewer self-review prevention, reject/request-evidence notes, audit records, and role isolation against the actual database.
- The current automated checks are static security/configuration tests; they do not replace PostgreSQL integration tests, browser click-through, or production verification.
- Founder/Admin review UI and the complete interactive map/comparison/data catalogue remain incomplete.


## Founder portal (initial UI foundation)

- Open `/founder` on the deployed site to reach the staff sign-in screen.
- Sign-in uses Supabase Auth. The portal reads the authenticated user's existing WRF role from `wrf_user_roles`; it never creates or assigns privileged roles in the browser.
- Founder/admin sessions can view recent audit events if the migration and database policies are active. Authorized staff can review queued values through the protected `wrf_review_value` RPC.
- The dashboard displays counts from database queries. If a query fails or configuration is missing, the UI reports unavailable/configuration status rather than inventing values.
- The AI Developer card is only an integration placeholder. No AI provider, repository-editing agent, sandbox, or deployment approval workflow is connected.
- The portal has not yet been end-to-end tested against the actual Supabase project. Do not treat the UI being deployed as proof that database auth, review actions, or RLS have passed live verification.
