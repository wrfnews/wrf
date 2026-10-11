import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, BookOpen, CheckCircle2, Compass, Database, Globe2, Menu, Search, ShieldCheck, X } from 'lucide-react';
import { isSupabaseConfigured, supabase, type Country, type PublishedFact } from './lib/supabase';

const regions = ['All regions', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];

export default function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [publishedFacts, setPublishedFacts] = useState<PublishedFact[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All regions');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadCountries() {
      if (!supabase) { setLoading(false); return; }
      const [{ data, error: queryError }, { data: factsData }] = await Promise.all([
        supabase.from('wrf_countries').select('id,iso3,name,capital,continent,created_at,updated_at').order('name'),
        supabase.from('wrf_indicator_values').select('id,numeric_value,text_value,reference_year,evidence_url,status,wrf_countries(name,iso3),wrf_indicators(name,unit,code),wrf_sources(name,source_url)').eq('status', 'published').order('reference_year', { ascending: false }),
      ]);
      if (!alive) return;
      if (queryError) setError('Country data is not available yet. Check the database migration and read policies.');
      else setCountries((data ?? []) as Country[]);
      setPublishedFacts((factsData ?? []) as unknown as PublishedFact[]);
      setLoading(false);
    }
    void loadCountries();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => countries.filter((country) => {
    const matchesSearch = `${country.name} ${country.iso3} ${country.capital ?? ''}`.toLowerCase().includes(search.toLowerCase());
    const matchesRegion = region === 'All regions' || country.continent === region;
    return matchesSearch && matchesRegion;
  }), [countries, search, region]);

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#home" aria-label="World Revealed Fact home"><span className="brand-mark"><Globe2 size={23}/></span><span><strong>WRF</strong><small>WORLD REVEALED FACT</small></span></a>
      <nav className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Main navigation">
        <a href="#explore" onClick={() => setMenuOpen(false)}>Explore</a><a href="#principles" onClick={() => setMenuOpen(false)}>Our standard</a><a href="#compare" onClick={() => setMenuOpen(false)}>Compare</a><a href="#map" onClick={() => setMenuOpen(false)}>Map</a><a href="#data" onClick={() => setMenuOpen(false)}>Data</a><a href="#sources" onClick={() => setMenuOpen(false)}>Sources</a>
      </nav>
      <a className="nav-cta" href="#explore">Explore atlas <ArrowRight size={16}/></a>
      <button className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button>
    </header>
    <main>
      <section className="hero" id="home">
        <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> A clearer view of our world</div>
          <h1>Reveal the world.<br/><em>Verify the facts.</em></h1>
          <p className="hero-intro">Explore countries, compare real-world indicators, and trace every published fact back to its source.</p>
          <div className="hero-actions"><a className="button-primary" href="#explore">Explore the atlas <ArrowRight size={17}/></a><a className="button-quiet" href="#principles">How WRF works <ArrowDownRight size={17}/></a></div>
          <div className="hero-proof"><ShieldCheck size={17}/><span>Source-led. Time-aware. Evidence-first.</span></div>
        </div>
        <div className="globe-scene" aria-label="Decorative abstract globe illustration"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="globe"><div className="longitude"/><div className="latitude"/><div className="continent-shape land-a"/><div className="continent-shape land-b"/><div className="continent-shape land-c"/></div><span className="orbit-point point-a"/><span className="orbit-point point-b"/><div className="globe-caption"><span>GLOBAL ATLAS</span><strong>Facts with a footprint.</strong></div></div>
        <div className="hero-bottom"><span>01 / KNOW THE WORLD</span><span>REAL → TRACEABLE → TIME-AWARE → EXPLAINABLE</span></div>
      </section>
      <section className="principles section-wrap" id="principles"><div className="section-heading"><div><span className="kicker">THE WRF STANDARD</span><h2>Trust begins with evidence.</h2></div><p>Information should be understandable, checkable, and clear about what is—and is not—known.</p></div>
        <div className="principle-grid"><article className="principle-card"><span className="icon-box"><Database/></span><span className="card-number">01</span><h3>Traceable by design</h3><p>Every published indicator should connect to a named source and supporting evidence.</p></article><article className="principle-card"><span className="icon-box"><CheckCircle2/></span><span className="card-number">02</span><h3>Reviewed before release</h3><p>Submissions remain unpublished until an authorized reviewer checks the evidence.</p></article><article className="principle-card"><span className="icon-box"><BookOpen/></span><span className="card-number">03</span><h3>Time-aware context</h3><p>Reference years and source details help readers understand when a fact applies.</p></article></div>
      </section>
      <section className="explore-section" id="explore"><div className="section-wrap"><div className="section-heading explore-heading"><div><span className="kicker">EXPLORE THE WORLD</span><h2>Country atlas</h2><p className="section-subtitle">Find a country and begin with information we can trace.</p></div><div className="atlas-counter"><Compass size={19}/><span><strong>{countries.length.toLocaleString()}</strong><small>COUNTRIES LOADED</small></span></div></div>
        <div className="search-row"><label className="search-box"><Search size={19}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country, capital, or ISO code…" aria-label="Search countries"/></label><label className="region-select"><span className="sr-only">Filter by region</span><select value={region} onChange={(e) => setRegion(e.target.value)}>{regions.map((r) => <option key={r}>{r}</option>)}</select></label></div>
        {!isSupabaseConfigured && <div className="notice"><ShieldCheck size={20}/><div><strong>Database connection not configured</strong><p>Connect the Supabase project and apply the migration to load country data. No statistics are fabricated for this preview.</p></div></div>}
        {error && <div className="notice warning"><ShieldCheck size={20}/><div><strong>Data connection needs attention</strong><p>{error}</p></div></div>}
        {loading ? <div className="empty-state"><span className="spinner"/><p>Loading country records…</p></div> : filtered.length ? <div className="country-grid">{filtered.map((country) => <article className="country-card" key={country.id} role="button" tabIndex={0} aria-label={`View ${country.name} details`} onClick={() => setSelectedCountry(country)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCountry(country); } }}><div className="country-symbol"><Globe2 size={21}/></div><div className="country-card-main"><h3>{country.name}</h3><p>{country.capital || 'Capital not recorded'}</p></div><span className="iso-code">{country.iso3}</span><span className="country-region">{country.continent || 'Region not recorded'}</span></article>)}</div> : <div className="empty-state"><div className="empty-icon"><Globe2 size={27}/></div><h3>{countries.length ? 'No countries match your search' : 'The atlas is ready for verified data'}</h3><p>{countries.length ? 'Try a different search term or region.' : 'Country records will appear here after the database is connected and the dataset is reviewed. We will not fill this space with made-up figures.'}</p>{countries.length > 0 && <button className="text-button" onClick={() => {setSearch(''); setRegion('All regions');}}>Clear filters</button>}</div>}
      </div></section>
      <section className="tools-section section-wrap" id="compare"><div className="section-heading"><div><span className="kicker">PUT FACTS IN CONTEXT</span><h2>Compare with confidence.</h2><p className="section-subtitle">Compare countries only when the same indicator, source context, and reference year are available.</p></div><span className="feature-mark"><Compass size={22}/></span></div><div className="tool-panel"><div className="tool-panel-icon"><ArrowRight size={22}/></div><div><h3>Country comparison workspace</h3><p>Comparison controls will become active when country records and reviewed indicator values are available. WRF will not fill missing values with estimates or invented numbers.</p></div><span className="status-pill">Awaiting verified data</span></div></section>
      <section className="map-section" id="map"><div className="section-wrap"><div className="section-heading"><div><span className="kicker">GEOGRAPHY, WITH CONTEXT</span><h2>Explore the world map.</h2><p className="section-subtitle">A geographic view built around traceable country records—not decorative statistics.</p></div></div><div className="map-placeholder"><div className="map-grid" aria-hidden="true"><span className="map-dot dot-1"/><span className="map-dot dot-2"/><span className="map-dot dot-3"/><span className="map-dot dot-4"/><span className="map-dot dot-5"/><div className="map-continent continent-one"/><div className="map-continent continent-two"/><div className="map-continent continent-three"/><div className="map-continent continent-four"/></div><div className="map-message"><Globe2 size={25}/><h3>Map data is not connected yet</h3><p>The interactive atlas will use verified country boundaries and published data once the data layer is ready.</p><a className="button-quiet" href="#explore">Browse country records <ArrowRight size={16}/></a></div><span className="map-caption">WORLD ATLAS · DATA CONNECTION PENDING</span></div></div></section>
      <section className="data-section section-wrap" id="data"><div className="section-heading"><div><span className="kicker">THE EVIDENCE LIBRARY</span><h2>Explore the data catalogue.</h2><p className="section-subtitle">Every indicator should have a definition, unit where relevant, source, and reference period.</p></div></div><div className="data-grid"><article className="data-card"><span className="data-index">01 / DEFINITIONS</span><Database size={22}/><h3>Indicators</h3><p>Understand what each measure means and how it is expressed.</p><span className="data-state">Catalogue pending connection</span></article><article className="data-card"><span className="data-index">02 / PROVENANCE</span><ShieldCheck size={22}/><h3>Sources</h3><p>Trace published facts to approved publishers and source documents.</p><span className="data-state">No sources displayed yet</span></article><article className="data-card"><span className="data-index">03 / SUPPORT</span><BookOpen size={22}/><h3>Evidence & methods</h3><p>Review evidence links, reference years, and methodology notes.</p><span className="data-state">Evidence library pending</span></article></div></section>
      <section className="source-section section-wrap" id="sources"><div className="source-banner"><div className="source-emblem"><ShieldCheck size={27}/></div><div><span className="kicker">OUR PROMISE</span><h2>No source, no verified fact.</h2><p>WRF distinguishes evidence from assumptions. Published information should be reviewable, dated, and linked to its origin.</p></div><a href="#principles" aria-label="Learn about our standard"><ArrowRight size={20}/></a></div></section>
    </main>
    {selectedCountry && <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelectedCountry(null); }}><section className="country-detail-modal" role="dialog" aria-modal="true" aria-labelledby="country-detail-title"><button className="modal-close" onClick={() => setSelectedCountry(null)} aria-label="Close country details"><X size={20}/></button><span className="kicker">COUNTRY PROFILE · {selectedCountry.iso3}</span><h2 id="country-detail-title">{selectedCountry.name}</h2><div className="country-facts-meta"><div><span>Capital</span><strong>{selectedCountry.capital || 'Not recorded'}</strong></div><div><span>Continent</span><strong>{selectedCountry.continent || 'Not recorded'}</strong></div></div><div className="detail-divider"/><h3>Published, sourced facts</h3>{publishedFacts.filter((fact) => fact.wrf_countries?.iso3 === selectedCountry.iso3).length ? <div className="published-facts-list">{publishedFacts.filter((fact) => fact.wrf_countries?.iso3 === selectedCountry.iso3).map((fact) => <article className="published-fact" key={fact.id}><div><h4>{fact.wrf_indicators?.name || 'Indicator'}</h4><p>Reference year: {fact.reference_year}</p></div><strong>{fact.numeric_value !== null ? `${fact.numeric_value.toLocaleString()}${fact.wrf_indicators?.unit ? ` ${fact.wrf_indicators.unit}` : ''}` : fact.text_value}</strong><a href={fact.evidence_url} target="_blank" rel="noreferrer">View evidence <ArrowRight size={14}/></a></article>)}</div> : <div className="detail-empty"><ShieldCheck size={20}/><p>No published indicator values are available for this country yet. WRF only displays facts that passed review and have a traceable evidence link.</p></div>}<button className="button-primary modal-done" onClick={() => setSelectedCountry(null)}>Done <CheckCircle2 size={16}/></button></section></div>}
    <footer className="footer"><a className="brand footer-brand" href="#home"><span className="brand-mark"><Globe2 size={20}/></span><span><strong>WRF</strong><small>WORLD REVEALED FACT</small></span></a><span>Reveal the World. Verify the Facts.</span><span>Evidence first · Always</span></footer>
  </div>;
}
