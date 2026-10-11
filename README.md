# World Revealed Fact (WRF) — Foundation Starter

**Tagline:** Reveal the World. Verify the Facts.

This starter contains a React/Vite public-site foundation and a Supabase SQL migration. It is not production-ready or deployed until the database migration, trusted Founder provisioning, integration tests, and deployment are completed. No fabricated country data is included.

## Local setup
1. Install Node.js 20+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and publishable key.
4. Review and run `supabase/migrations/202610110001_wrf_foundation.sql` in a development Supabase project.
5. Run `npm run test:security`, `npm run typecheck`, and `npm run build`.

Never put a Supabase service-role key in browser code. Public facts must be published and traceable to evidence. The Founder bootstrap and full review workflows are not complete in this starter.