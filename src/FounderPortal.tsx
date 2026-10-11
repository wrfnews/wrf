import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeft, CheckCircle2, CircleAlert, Database, FileCheck2, FileText, Globe2, KeyRound, LogOut, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type WrfRole = 'founder' | 'admin' | 'reviewer' | 'user';
type ReviewItem = {
  id: string; numeric_value: number | null; text_value: string | null; reference_year: number;
  evidence_url: string; status: string; created_at: string;
  wrf_countries: { name: string; iso3: string } | null;
  wrf_indicators: { name: string; unit: string | null } | null;
  wrf_sources: { name: string; status: string } | null;
};
type Metrics = { countries: number | null; sources: number | null; indicators: number | null; pending: number | null };
const blankMetrics: Metrics = { countries: null, sources: null, indicators: null, pending: null };

export default function FounderPortal() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [role, setRole] = useState<WrfRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(blankMetrics);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [audit, setAudit] = useState<Array<{ id: string; action: string; entity_type: string; created_at: string; details: Record<string, unknown> }>>([]);
  const [busyId, setBusyId] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const setNotice = (text: string, isError = false) => { setMessage(text); setMessageError(isError); };
  const valueLabel = (item: ReviewItem) => {
    if (item.numeric_value === null) return item.text_value ?? 'Unavailable';
    return item.numeric_value.toLocaleString() + (item.wrf_indicators?.unit ? ' ' + item.wrf_indicators.unit : '');
  };
  const dateLabel = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const loadDashboard = useCallback(async () => {
    if (!supabase || !role) return;
    setLoading(true);
    const [countries, sources, indicators, pending] = await Promise.all([
      supabase.from('wrf_countries').select('id', { count: 'exact', head: true }),
      supabase.from('wrf_sources').select('id', { count: 'exact', head: true }),
      supabase.from('wrf_indicators').select('id', { count: 'exact', head: true }),
      supabase.from('wrf_indicator_values').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_review']),
    ]);
    setMetrics({
      countries: countries.error ? null : countries.count,
      sources: sources.error ? null : sources.count,
      indicators: indicators.error ? null : indicators.count,
      pending: pending.error ? null : pending.count,
    });
    const [reviewResult, auditResult] = await Promise.all([
      supabase.from('wrf_indicator_values')
        .select('id,numeric_value,text_value,reference_year,evidence_url,status,created_at,wrf_countries(name,iso3),wrf_indicators(name,unit),wrf_sources(name,status)')
        .in('status', ['pending', 'in_review']).order('created_at', { ascending: true }).limit(50),
      role === 'founder' || role === 'admin'
        ? supabase.from('wrf_audit_log').select('id,action,entity_type,created_at,details').order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [], error: null }),
    ]);
    setReviews((reviewResult.data ?? []) as unknown as ReviewItem[]);
    setAudit((auditResult.data ?? []) as unknown as typeof audit);
    const errors = [countries.error, sources.error, indicators.error, pending.error, reviewResult.error, auditResult.error].filter(Boolean);
    if (errors.length) setNotice('Some dashboard data could not be loaded. Check that the WRF migration is applied and database permissions are configured.', true);
    setLoading(false);
  }, [role]);

  const resolveSession = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setUserEmail(''); setRole(null); setLoading(false); return; }
    setUserEmail(session.user.email ?? '');
    const { data, error } = await supabase.from('wrf_user_roles').select('role').eq('user_id', session.user.id).maybeSingle();
    if (error) setNotice('Your WRF role could not be checked. Confirm the database migration and role-table permissions.', true);
    const foundRole = data?.role as WrfRole | undefined;
    if (foundRole && ['founder', 'admin', 'reviewer'].includes(foundRole)) { setRole(foundRole); setNotice(''); }
    else { setRole(null); setNotice('This account is signed in but has no WRF staff role. Founder access must be provisioned by the project owner; signing up never grants Founder privileges.', true); }
    setLoading(false);
  }, []);

  useEffect(() => {
    void resolveSession();
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => { void resolveSession(); }, 0); });
    return () => subscription.unsubscribe();
  }, [resolveSession]);
  useEffect(() => { if (role) void loadDashboard(); }, [role, loadDashboard]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true); setNotice('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) setNotice('Sign-in failed. Check the email and password, or confirm Supabase Authentication is configured.', true);
    else { setPassword(''); await resolveSession(); }
  }
  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut(); setRole(null); setUserEmail(''); setReviews([]); setAudit([]); setMetrics(blankMetrics);
    setNotice('You have signed out.');
  }
  async function reviewValue(item: ReviewItem, decision: 'approved' | 'rejected' | 'request_evidence') {
    if (!supabase) return;
    const note = (reviewNotes[item.id] ?? '').trim();
    if (decision !== 'approved' && !note) { setNotice('Add a review note before rejecting a value or requesting more evidence.', true); return; }
    setBusyId(item.id); setNotice('');
    const { error } = await supabase.rpc('wrf_review_value', { p_value_id: item.id, p_decision: decision, p_note: note || null });
    setBusyId('');
    if (error) setNotice(error.message.includes('approved source') ? 'This value cannot be published until its source has been approved.' : 'The review action failed. Check your role and the database response, then retry.', true);
    else {
      setNotice(decision === 'approved' ? 'Value published and review recorded.' : decision === 'rejected' ? 'Value rejected and review recorded.' : 'Evidence requested; value remains unpublished.');
      setReviewNotes((previous) => ({ ...previous, [item.id]: '' }));
      await loadDashboard();
    }
  }

  return <div className="founder-shell">
    <header className="founder-topbar">
      <a href="/" className="founder-brand"><span className="founder-brand-mark"><Globe2 size={22}/></span><span><strong>WRF</strong><small>FOUNDER CONSOLE</small></span></a>
      <div className="founder-top-actions"><a href="/" className="founder-back"><ArrowLeft size={16}/> Public atlas</a>{role && <button className="founder-signout" onClick={() => void handleSignOut()}><LogOut size={16}/> Sign out</button>}</div>
    </header>
    <main className="founder-main">
      <div className="founder-heading"><div><span className="founder-kicker">WORLD REVEALED FACT / CONTROL CENTER</span><h1>Founder console</h1><p>Review real WRF operations. Unavailable data is shown honestly, never filled with invented metrics.</p></div><div className="founder-status"><span className={isSupabaseConfigured ? 'founder-status-dot configured' : 'founder-status-dot'}/>{isSupabaseConfigured ? 'Database settings present' : 'Database not configured'}</div></div>
      {!isSupabaseConfigured && <div className="founder-alert"><CircleAlert size={20}/><div><strong>Supabase is not configured</strong><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to the deployment environment, then redeploy. Never put a service-role key in browser variables.</p></div></div>}
      {message && <div className={messageError ? 'founder-alert error' : 'founder-alert'} role="status"><CircleAlert size={20}/><p>{message}</p></div>}
      {!role ? <section className="founder-login-card"><div className="founder-login-icon"><KeyRound size={25}/></div><span className="founder-kicker">SECURE STAFF SIGN-IN</span><h2>Access the control center</h2><p>Use an existing WRF staff account. This portal has no public sign-up or self-promotion to Founder.</p>
        <form onSubmit={handleSignIn} className="founder-login-form"><label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" disabled={!isSupabaseConfigured}/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Your account password" disabled={!isSupabaseConfigured}/></label><button type="submit" disabled={!isSupabaseConfigured || submitting || loading}>{submitting ? 'Signing in…' : 'Sign in securely'} <ShieldCheck size={16}/></button></form>
        <div className="founder-login-foot"><ShieldCheck size={15}/><span>Roles are read from the database. Privileged access is never granted by the browser.</span></div>
      </section> : <>
        <div className="founder-welcome"><div><span>Signed in as</span><strong>{userEmail || 'Authenticated staff member'}</strong></div><span className="founder-role-pill">{role}</span></div>
        <section className="founder-metric-grid" aria-label="Live database counts">
          <article className="founder-metric"><span><Globe2 size={17}/> Country records</span><strong>{loading ? '…' : metrics.countries === null ? 'Unavailable' : metrics.countries.toLocaleString()}</strong><small>Records visible to this session</small></article>
          <article className="founder-metric"><span><FileText size={17}/> Sources</span><strong>{loading ? '…' : metrics.sources === null ? 'Unavailable' : metrics.sources.toLocaleString()}</strong><small>Database records; source status checked separately</small></article>
          <article className="founder-metric"><span><Database size={17}/> Indicators</span><strong>{loading ? '…' : metrics.indicators === null ? 'Unavailable' : metrics.indicators.toLocaleString()}</strong><small>Defined measures available in WRF</small></article>
          <article className="founder-metric"><span><FileCheck2 size={17}/> Awaiting review</span><strong>{loading ? '…' : metrics.pending === null ? 'Unavailable' : metrics.pending.toLocaleString()}</strong><small>Pending or in-review submissions</small></article>
        </section>
        <section className="founder-panel"><div className="founder-panel-heading"><div><span className="founder-kicker">EVIDENCE WORKFLOW</span><h2>Data review queue</h2><p>Values remain private until approved by an authorized reviewer and backed by an approved source.</p></div><button className="founder-refresh" onClick={() => void loadDashboard()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
          {loading ? <div className="founder-empty">Loading review queue…</div> : reviews.length === 0 ? <div className="founder-empty"><CheckCircle2 size={22}/><strong>No pending records visible</strong><span>This reflects the database query result; it is not a fabricated health status.</span></div> : <div className="founder-review-list">{reviews.map((item) => <article className="founder-review-item" key={item.id}><div className="founder-review-top"><div><span className="founder-review-country">{item.wrf_countries?.name ?? 'Country unavailable'} · {item.wrf_countries?.iso3 ?? '—'}</span><h3>{item.wrf_indicators?.name ?? 'Indicator unavailable'}</h3></div><span className="founder-review-status">{item.status.replace('_', ' ')}</span></div><div className="founder-review-facts"><span>Value <strong>{valueLabel(item)}</strong></span><span>Reference year <strong>{item.reference_year}</strong></span><span>Source <strong>{item.wrf_sources?.name ?? 'Unavailable'} ({item.wrf_sources?.status ?? 'unknown'})</strong></span></div><a className="founder-evidence-link" href={item.evidence_url} target="_blank" rel="noreferrer">Open evidence in new tab ↗</a><label className="founder-note-label">Review note<textarea value={reviewNotes[item.id] ?? ''} onChange={(event) => setReviewNotes((previous) => ({ ...previous, [item.id]: event.target.value }))} rows={2} placeholder="Record the reason or what evidence is missing…"/></label><div className="founder-review-actions"><button disabled={busyId === item.id} onClick={() => void reviewValue(item, 'approved')}><CheckCircle2 size={15}/> Approve & publish</button><button className="reject" disabled={busyId === item.id} onClick={() => void reviewValue(item, 'rejected')}><XCircle size={15}/> Reject</button><button className="request" disabled={busyId === item.id} onClick={() => void reviewValue(item, 'request_evidence')}><FileCheck2 size={15}/> Request evidence</button></div></article>)}</div>}
        </section>
        {(role === 'founder' || role === 'admin') && <section className="founder-panel"><div className="founder-panel-heading"><div><span className="founder-kicker">ACCOUNTABILITY</span><h2>Recent audit events</h2><p>Read-only audit history from the WRF database.</p></div><Activity size={21}/></div>{loading ? <div className="founder-empty">Loading audit events…</div> : audit.length === 0 ? <div className="founder-empty">No audit events are visible in the current database.</div> : <div className="founder-audit-list">{audit.map((event) => <article className="founder-audit-row" key={event.id}><span className="founder-audit-icon"><Activity size={15}/></span><div><strong>{event.action}</strong><small>{event.entity_type} · {dateLabel(event.created_at)}</small></div><code>{event.id.slice(0, 8)}</code></article>)}</div>}</section>}
        <section className="founder-panel founder-ai-panel"><div className="founder-ai-symbol"><Activity size={23}/></div><div><span className="founder-kicker">FOUNDER-ONLY / PLANNED INTEGRATION</span><h2>WRF AI Developer</h2><p>Entry point reserved for a future proposal-and-approval workflow. Provider routing, repository analysis, sandboxed builds, and deployment approval are not connected yet.</p><span className="founder-planned-pill">Not configured</span></div></section>
      </>}
      <footer className="founder-footer"><span>WRF · Reveal the World. Verify the Facts.</span><span><Activity size={13}/> {isSupabaseConfigured ? 'Configuration present; live data depends on database access.' : 'Waiting for database configuration.'}</span></footer>
    </main>
  </div>;
}
