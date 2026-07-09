import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  Building2,
  ExternalLink,
  FileCheck2,
  LogOut,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  ShieldCheck,
  ShoppingCart,
  ListTodo,
  Pencil,
  Trash2
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const TOKEN_STORAGE_KEY = 'partner_os_token';
const USER_STORAGE_KEY = 'partner_os_user';
const AUTH_EXPIRED_EVENT = 'partner-os-auth-expired';

function clearStoredSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur API' }));
    if (response.status === 401 && path !== '/auth/login') {
      clearStoredSession();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      throw new Error('Votre session a expiré');
    }
    throw new Error(error.message || 'Erreur API');
  }
  if (response.status === 204) return null;
  return response.json();
}

function money(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function percent(value) {
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0))} %`;
}

function date(value) {
  return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(value)) : '-';
}

function App() {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw && token ? { user: JSON.parse(raw), token } : null;
  });
  const [page, setPage] = useState(() => pageFromLocation());
  const [loginMessage, setLoginMessage] = useState('');

  useEffect(() => {
    const onPopState = () => setPage(pageFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      setSession(null);
      setLoginMessage('Votre session a expiré');
      if (window.location.pathname !== '/login') window.history.replaceState({}, '', '/login');
      setPage('dashboard');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, []);

  useEffect(() => {
    if (!session) return;
    api('/auth/me')
      .then((result) => {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(result.user));
        setSession((current) => current ? { ...current, user: result.user } : current);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!session && window.location.pathname !== '/login') {
      window.history.replaceState({}, '', '/login');
    }
  }, [session]);

  const navigate = (nextPage) => {
    const path = pathFromPage(nextPage);
    if (path !== `${window.location.pathname}${window.location.search}`) window.history.pushState({}, '', path);
    setPage(nextPage);
  };

  const logout = () => {
    clearStoredSession();
    setLoginMessage('');
    setSession(null);
    window.history.replaceState({}, '', '/login');
  };

  if (!session) return <Login message={loginMessage} onLogin={(nextSession) => {
    setLoginMessage('');
    setSession(nextSession);
    navigate('dashboard');
  }} />;
  return (
    <Shell user={session.user} page={page} setPage={navigate} logout={logout}>
      {session.user.role === 'admin' ? <AdminApp page={page} setPage={navigate} /> : <PartnerApp page={page} user={session.user} />}
    </Shell>
  );
}

function pageFromLocation() {
  const match = window.location.pathname.match(/^\/partners\/([0-9a-f-]{36})$/i);
  if (match) {
    const params = new URLSearchParams(window.location.search);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return `partner-detail:${match[1]}${suffix}`;
  }
  if (window.location.pathname === '/login') return 'dashboard';
  if (window.location.pathname === '/partners') return 'partners';
  if (window.location.pathname === '/crm') return 'crm';
  if (window.location.pathname === '/dashboard') return 'dashboard';
  return 'dashboard';
}

function pathFromPage(page) {
  if (page.startsWith('partner-detail:')) {
    const value = page.slice('partner-detail:'.length);
    const [id, query = ''] = value.split('?');
    return `/partners/${id}${query ? `?${query}` : ''}`;
  }
  if (page === 'partners') return '/partners';
  if (page === 'crm') return '/crm';
  if (page === 'dashboard') return '/dashboard';
  return '/dashboard';
}

function Login({ message, onLogin }) {
  const [form, setForm] = useState({ email: 'admin@4000m.com', password: 'Admin4000m!' });
  const [error, setError] = useState(message || '');

  useEffect(() => {
    setError(message || '');
  }, [message]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const session = await api('/auth/login', { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
      onLogin(session);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand-row">
          <ShieldCheck size={30} />
          <div>
            <h1>Partner OS</h1>
            <p>4000m partner operations</p>
          </div>
        </div>
        <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Mot de passe<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary">Se connecter</button>
        <div className="demo-credentials">
          <span>Admin: admin@4000m.com / Admin4000m!</span>
          <span>Partenaire: partner-alpes-tandem@4000m.com / Partner4000m!</span>
        </div>
      </form>
    </main>
  );
}

function Shell({ user, page, setPage, logout, children }) {
  const adminItems = [
    ['dashboard', 'Dashboard', BarChart3],
    ['partners', 'Partenaires', Building2],
    ['crm', 'Gestion', ListTodo]
  ];
  const partnerItems = [
    ['partner-home', 'Espace', Building2]
  ];
  const items = user.role === 'admin' ? adminItems : partnerItems;
  return (
    <div className="app-shell">
      <aside>
        <div className="side-brand">Partner OS</div>
        <nav>
          {items.map(([key, label, Icon]) => (
            <button key={key} className={(page === key || (key === 'partners' && page.startsWith('partner-detail:'))) ? 'active' : ''} onClick={() => setPage(key)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <h2>{page.startsWith('partner-detail:') ? 'Partenaires' : items.find(([key]) => key === page)?.[1] || 'Partner OS'}</h2>
            <p>{user.role === 'admin' ? 'Console interne 4000m' : 'Espace partenaire'}</p>
          </div>
          <button className="ghost" onClick={logout}><LogOut size={17} /> Déconnexion</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function useData(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const load = async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      setState({ data: await api(path), loading: false, error: '' });
    } catch (error) {
      setState({ data: null, loading: false, error: error.message });
    }
  };
  useEffect(() => { load(); }, deps);
  return { ...state, reload: load };
}

function AdminApp({ page, setPage }) {
  if (page === 'dashboard') return <Dashboard setPage={setPage} />;
  if (page === 'partners') return <Partners setPage={setPage} />;
  if (page === 'crm') return <CrmKanban setPage={setPage} />;
  if (page.startsWith('partner-detail:')) {
    const detail = parsePartnerDetailPage(page);
    return <PartnerCrm partnerId={detail.partnerId} initialTab={detail.tab} initialFilter={detail.filter} setPage={setPage} />;
  }
  if (page === 'products') return <Products />;
  if (page === 'tasks') return <Tasks />;
  if (page === 'orders') return <Orders />;
  if (page === 'invoices') return <Invoices />;
  if (page === 'alerts') return <Alerts />;
  return <Dashboard />;
}

function parsePartnerDetailPage(page) {
  const value = page.slice('partner-detail:'.length);
  const [partnerId, query = ''] = value.split('?');
  const params = new URLSearchParams(query);
  return {
    partnerId,
    tab: params.get('tab') || 'overview',
    filter: params.get('filter') || ''
  };
}

function PartnerApp({ page, user }) {
  if (page === 'partner-home') return <PartnerHome user={user} />;
  if (page === 'orders') return <Orders partner />;
  if (page === 'products') return <Products partner />;
  if (page === 'invoices') return <Invoices partner />;
  if (page === 'alerts') return <Alerts />;
  return <PartnerHome user={user} />;
}

function Panel({ title, action, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function TableContainer({ children, className = '' }) {
  return (
    <div className={`table-scroll ${className}`}>
      <div className="scroll-hint">← Faire défiler →</div>
      {children}
    </div>
  );
}

function State({ loading, error, children }) {
  if (loading) return <div className="muted-block">Chargement...</div>;
  if (error) return <div className="error-block">{error}</div>;
  return children;
}

function Dashboard({ setPage }) {
  const { data, loading, error, reload } = useData('/dashboard');
  const offerControl = useData('/dashboard/offer-control');
  const [report, setReport] = useState(null);
  const runOfferControl = async () => {
    const result = await api('/offer-control/run', { method: 'POST' });
    setReport(result);
    reload();
    offerControl.reload();
  };
  return (
    <State loading={loading || offerControl.loading} error={error || offerControl.error}>
      {data && offerControl.data && (
        <div className="stack">
          <div className="kpi-grid">
            <Kpi label="CA HT" value={money(data.summary.total_revenue_ht)} />
            <Kpi label="Marge brute" value={money(data.summary.total_margin_ht)} />
            <Kpi label="Marge moyenne" value={money(data.summary.average_margin_ht)} />
            <Kpi label="Commandes" value={data.summary.orders_count} />
            <Kpi label="Partenaires actifs" value={data.summary.active_partners_count} />
            <Kpi label="Alertes prix" value={data.summary.open_price_alerts} tone="warn" />
            <Kpi label="Tâches To do" value={data.summary.todo_tasks_count} tone={data.summary.todo_tasks_count ? 'warn' : ''} />
            <Kpi label="Tâches Doing" value={data.summary.doing_tasks_count} />
            <Kpi label="Tâches Done" value={data.summary.done_tasks_count} />
            <Kpi label="Critiques" value={data.summary.critical_tasks_count} tone={data.summary.critical_tasks_count ? 'warn' : ''} />
          </div>
          <Panel title="Contrôle de l’offre" action={<button className="primary" onClick={runOfferControl}><RefreshCw size={16} /> Lancer le contrôle de l’offre</button>}>
            {report && <p className="padded">Contrôle terminé : {report.checked_products} produits analysés, {report.anomalies_count} anomalies, {report.created_tasks} tâches ajoutées, {report.existing_tasks || 0} déjà existantes, {report.resolved_tasks || 0} résolues.</p>}
            <OfferControlTable rows={offerControl.data || []} navigate={setPage} />
          </Panel>
        </div>
      )}
    </State>
  );
}

function OfferControlTable({ rows, navigate }) {
  const openPartner = (id, tab = '', filter = '') => {
    const params = new URLSearchParams();
    if (tab) params.set('tab', tab);
    if (filter) params.set('filter', filter);
    navigate(`partner-detail:${id}${params.toString() ? `?${params.toString()}` : ''}`);
  };
  return (
    <TableContainer className="dashboard-table-container">
    <table className="data-table dashboard-offer-table">
      <thead><tr><th>Partenaire</th><th>Région</th><th>Importance</th><th>Poids CA estimé</th><th>Total produits</th><th>Référencés 4000m</th><th>Non référencés</th><th>Couverture</th><th>Anomalies prix</th><th>Dernier contrôle</th><th>Priorité action</th><th className="table-actions">Actions</th></tr></thead>
      <tbody>{rows.map((row) => {
        const coverage = Number(row.coverage_rate || 0);
        return (
          <tr key={row.id} className="clickable-row dashboard-row" onClick={() => openPartner(row.id)}>
            <td>{row.partner_name}</td>
            <td>{row.region || '-'}</td>
            <td><ImportanceBadge value={row.business_priority} /></td>
            <td>{row.estimated_revenue_share == null ? 'non renseigné' : `${percent(row.estimated_revenue_share)} du CA`}</td>
            <td>{row.products_count}</td>
            <td>{row.listed_count}</td>
            <td><button className="link-button" onClick={(event) => { event.stopPropagation(); openPartner(row.id, 'products', 'unlisted'); }}>{row.unlisted_count}</button></td>
            <td><Badge severity={coverage >= 90 ? 'faible' : coverage >= 60 ? 'moyenne' : 'critique'}>{percent(coverage)}</Badge></td>
            <td><button className="link-button" onClick={(event) => { event.stopPropagation(); openPartner(row.id, 'benchmark', 'anomalies'); }}>{row.price_anomalies}</button></td>
            <td>{date(row.last_checked_at)}</td>
            <td><Badge severity={row.priority === 'haute' ? 'critique' : row.priority === 'moyenne' ? 'moyenne' : 'faible'}>{row.priority}</Badge></td>
            <td className="table-actions"><button onClick={(event) => { event.stopPropagation(); openPartner(row.id); }}>Voir</button></td>
          </tr>
        );
      })}</tbody>
    </table>
    </TableContainer>
  );
}

function ImportanceBadge({ value }) {
  if (!value) return <span className="muted">non renseigné</span>;
  return <span className={`importance-badge ${value}`}>{value}</span>;
}

function Kpi({ label, value, tone }) {
  return <div className={`kpi ${tone || ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SimpleList({ title, rows, valueKey, moneyValue }) {
  return (
    <Panel title={title}>
      <TableContainer>
      <table className="data-table"><tbody>{rows.map((row) => (
        <tr key={row.id}><td>{row.name}</td><td className="right">{moneyValue ? money(row[valueKey]) : row[valueKey]}</td></tr>
      ))}</tbody></table>
      </TableContainer>
    </Panel>
  );
}

function Partners({ setPage }) {
  const { data, loading, error, reload } = useData('/partners');
  const [form, setForm] = useState({ name: '', company: '', email: '', city: '', region: '', status: 'actif', health_score: 70, business_priority: '', estimated_revenue_share: '' });

  async function createPartner(event) {
    event.preventDefault();
    await api('/partners', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        business_priority: form.business_priority || null,
        estimated_revenue_share: form.estimated_revenue_share === '' ? null : Number(form.estimated_revenue_share)
      })
    });
    setForm({ name: '', company: '', email: '', city: '', region: '', status: 'actif', health_score: 70, business_priority: '', estimated_revenue_share: '' });
    reload();
  }
  return (
    <State loading={loading} error={error}>
      <div className="two-col wide-left">
        <Panel title="CRM partenaires">
          <TableContainer>
          <table className="data-table partners-table">
            <thead><tr><th>Partenaire</th><th>Contact</th><th>Zone</th><th>Importance</th><th>Poids CA</th><th>Statut</th><th>Santé</th></tr></thead>
            <tbody>{data?.map((partner) => (
              <tr key={partner.id} className="clickable-row" onClick={() => setPage(`partner-detail:${partner.id}`)}>
                <td><strong>{partner.name}</strong><small>{partner.company}</small></td>
                <td>{partner.main_contact || '-'}<small>{partner.email}</small></td>
                <td>{partner.city}<small>{partner.region}</small></td>
                <td><ImportanceBadge value={partner.business_priority} /></td>
                <td>{partner.estimated_revenue_share == null ? 'non renseigné' : percent(partner.estimated_revenue_share)}</td>
                <td><Badge>{partner.status}</Badge></td>
                <td>{partner.health_score}/100</td>
              </tr>
            ))}</tbody>
          </table>
          </TableContainer>
        </Panel>
        <div className="stack">
          <Panel title="Créer un partenaire">
            <form className="compact-form" onSubmit={createPartner}>
              {['name', 'company', 'email', 'city', 'region'].map((field) => (
                <input key={field} placeholder={field} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={['name', 'company', 'email'].includes(field)} />
              ))}
              <label>Priorité partenaire<select value={form.business_priority} onChange={(e) => setForm({ ...form, business_priority: e.target.value })}><option value="">Non renseigné</option><option>stratégique</option><option>haute</option><option>moyenne</option><option>basse</option></select></label>
              <label>Poids estimé CA %<input type="number" step="0.01" min="0" max="100" value={form.estimated_revenue_share} onChange={(e) => setForm({ ...form, estimated_revenue_share: e.target.value })} /></label>
              <button className="primary">Créer</button>
            </form>
          </Panel>
          <Panel title="Pipeline opérationnel">
            <div className="summary-list">
              <span>Cliquer sur un partenaire ouvre sa fiche CRM complète.</span>
              <span>Les onglets centralisent la vue d’ensemble, les produits réels et le benchmark prix.</span>
              <span>Le benchmark est structuré pour accueillir un contrôle quotidien automatisé par IA.</span>
            </div>
          </Panel>
        </div>
      </div>
    </State>
  );
}

function PartnerCrm({ partnerId, initialTab = 'overview', initialFilter = '', setPage }) {
  const [tab, setTab] = useState(['overview', 'products', 'benchmark'].includes(initialTab) ? initialTab : 'overview');
  const [routeFilter, setRouteFilter] = useState(initialFilter);
  const partner = useData(`/partners/${partnerId}`, [partnerId]);
  const products = useData(`/products?partner_id=${partnerId}`, [partnerId]);
  const urls = useData(`/monitoring/urls?partner_id=${partnerId}`, [partnerId]);
  const checks = useData(`/monitoring/price-checks?partner_id=${partnerId}`, [partnerId]);
  const [analysis, setAnalysis] = useState(null);
  const [editRequest, setEditRequest] = useState(0);

  const loading = partner.loading || products.loading || urls.loading || checks.loading;
  const error = partner.error || products.error || urls.error || checks.error;
  const stats = buildPartnerStats(products.data || [], urls.data || []);

  useEffect(() => {
    setTab(['overview', 'products', 'benchmark'].includes(initialTab) ? initialTab : 'overview');
    setRouteFilter(initialFilter || '');
  }, [initialTab, initialFilter, partnerId]);

  async function refreshBenchmark() {
    await api('/monitoring/price-checks/run', { method: 'POST' });
    urls.reload();
    checks.reload();
  }

  async function generateAnalysis() {
    setAnalysis(await api(`/partners/${partnerId}/analysis`));
  }

  return (
    <State loading={loading} error={error}>
      {partner.data && (
        <div className="stack">
          <div className="partner-header">
            <div className="partner-header-main">
              <h2>{partner.data.name}</h2>
              <p>{partner.data.company} · {partner.data.city || 'Ville non renseignée'}{partner.data.region ? ` · ${partner.data.region}` : ''}</p>
              <div className="partner-header-meta">
                <ImportanceBadge value={partner.data.business_priority} />
                <span className="metric-pill">CA {partner.data.estimated_revenue_share == null ? 'n/r' : percent(partner.data.estimated_revenue_share)}</span>
                <span className={`metric-pill health-${healthTone(partner.data.health_score)}`}>Santé {partner.data.health_score}/100</span>
                <span className={`status-pill ${partner.data.status}`}>{partner.data.status}</span>
              </div>
            </div>
            <div className="partner-header-actions">
              <button className="ghost" onClick={() => setPage('dashboard')}><ArrowLeft size={17} /> Retour dashboard</button>
              <button onClick={() => { setTab('overview'); setEditRequest((value) => value + 1); }}><Pencil size={16} /> Modifier le partenaire</button>
            </div>
          </div>
          <PartnerOfferSummary stats={stats} />
          <div className="tabs">
            {[
              ['overview', 'Vue d’ensemble'],
              ['products', 'Produits'],
              ['benchmark', 'Benchmark']
            ].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
          </div>
          {tab === 'overview' && <PartnerOverview partner={partner.data} stats={stats} analysis={analysis} generateAnalysis={generateAnalysis} reloadPartner={partner.reload} editRequest={editRequest} />}
          {tab === 'products' && <ProductCrud partnerId={partnerId} products={products.data || []} urls={urls.data || []} initialFilter={routeFilter} reload={products.reload} openBenchmark={() => setTab('benchmark')} />}
          {tab === 'benchmark' && <BenchmarkTab partnerId={partnerId} />}
        </div>
      )}
    </State>
  );
}

function buildPartnerStats(products, urls) {
  const anomalies = products.reduce((count, product) => count + countProductAnomalies(product, urls), 0);
  const listed = products.filter((product) => Number(product.is_listed_on_4000m) === 1).length;
  const unlisted = products.length - listed;
  const referencedWithMargin = products.filter((product) => Number(product.is_listed_on_4000m) === 1 && product.margin_rate != null);
  const averageProductMargin = referencedWithMargin.reduce((sum, product, _index, arr) => sum + Number(product.margin_rate || 0) / arr.length, 0);
  const coverageRate = products.length ? (listed / products.length) * 100 : 0;
  const lastCheckedAt = urls
    .map((url) => url.last_checked_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  return {
    products: products.length,
    listed,
    unlisted,
    averageProductMargin,
    anomalies,
    coverageRate,
    lastCheckedAt
  };
}

function countProductAnomalies(product, urls = []) {
  const price4000m = product.price_4000m == null ? null : Number(product.price_4000m);
  const partnerPublicPrice = product.partner_public_price == null ? null : Number(product.partner_public_price);
  const marginRate = product.margin_rate == null ? null : Number(product.margin_rate);
  const listed = Number(product.is_listed_on_4000m) === 1;
  let count = 0;
  if (!listed || product.listing_status === 'à_référencer' || (product.status === 'actif' && price4000m == null)) count += 1;
  if (listed && price4000m != null && product.partner_purchase_price != null && marginRate != null && marginRate < 15 && Number(product.margin_exception_accepted) !== 1) count += 1;
  if (price4000m != null && partnerPublicPrice != null && partnerPublicPrice < price4000m) count += 1;
  count += urls.filter((url) => url.product_id === product.id && (url.status === 'error' || (url.type === 'competitor' && price4000m != null && url.last_detected_price != null && Number(url.last_detected_price) < price4000m))).length;
  return count;
}

function PartnerOfferSummary({ stats }) {
  const summaryCards = [
    { label: 'Produits', value: stats.products, helper: 'catalogue partenaire', tone: 'neutral', Icon: Boxes },
    { label: 'Référencés', value: stats.listed, helper: 'actifs 4000m', meta: percent(stats.coverageRate), tone: stats.coverageRate >= 90 ? 'success' : stats.coverageRate >= 60 ? 'warning' : 'danger', Icon: ShieldCheck },
    { label: 'À référencer', value: stats.unlisted, helper: 'opportunités', tone: stats.unlisted > 0 ? 'warning' : 'success', Icon: Plus },
    { label: 'Anomalies', value: stats.anomalies, helper: 'prix', tone: stats.anomalies > 0 ? 'danger' : 'success', Icon: AlertTriangle },
    { label: 'Marge', value: percent(stats.averageProductMargin), helper: 'moyenne', tone: stats.averageProductMargin >= 20 ? 'success' : stats.averageProductMargin > 0 ? 'warning' : 'neutral', Icon: BarChart3 }
  ];
  return (
    <section className="offer-summary">
      <div className="section-title">
        <h3>Synthèse contrôle offre</h3>
      </div>
      <div className="offer-kpi-grid">
        {summaryCards.map(({ Icon, ...card }) => (
          <div key={card.label} className={`offer-kpi-card ${card.tone}`}>
            <div className="offer-kpi-top">
              <span>{card.label}</span>
              <i><Icon size={15} /></i>
            </div>
            <strong>{card.value}</strong>
            <small>{card.helper}</small>
            {card.meta && <em>{card.meta}</em>}
          </div>
        ))}
      </div>
    </section>
  );
}

function healthTone(score) {
  const value = Number(score || 0);
  if (value >= 75) return 'success';
  if (value >= 50) return 'warning';
  return 'danger';
}

function PartnerOverview({ partner, stats, analysis, generateAnalysis, reloadPartner, editRequest }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => partnerFormFromPartner(partner));
  const linkedTasks = useData(`/tasks/cards?partner_id=${partner.id}&open=1`, [partner.id]);

  useEffect(() => {
    setForm(partnerFormFromPartner(partner));
    setEditing(false);
  }, [partner.id]);

  useEffect(() => {
    if (editRequest) setEditing(true);
  }, [editRequest]);

  async function submit(event) {
    event.preventDefault();
    await api(`/partners/${partner.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...form,
        health_score: Number(form.health_score || 0),
        estimated_revenue_share: form.estimated_revenue_share === '' ? null : Number(form.estimated_revenue_share),
        business_priority: form.business_priority || null,
        last_exchange_date: form.last_exchange_date || null
      })
    });
    await reloadPartner();
    setEditing(false);
  }

  return (
    <div className="stack">
      {editing ? (
        <Panel title="Modifier le partenaire">
            <form className="profile-form partner-edit-form" onSubmit={submit}>
              <label>Nom du partenaire<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
              <label>Société<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} required /></label>
              <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
              <label>Téléphone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label>Adresse<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
              <label>Ville<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
              <label>Région<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></label>
              <label>Contact principal<input value={form.main_contact} onChange={(event) => setForm({ ...form, main_contact: event.target.value })} /></label>
              <label>Statut<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>actif</option><option>suspendu</option><option>archive</option></select></label>
              <label>Score santé<input type="number" min="0" max="100" value={form.health_score} onChange={(event) => setForm({ ...form, health_score: event.target.value })} /></label>
              <label>Priorité partenaire<select value={form.business_priority} onChange={(event) => setForm({ ...form, business_priority: event.target.value })}><option value="">Non renseigné</option><option>stratégique</option><option>haute</option><option>moyenne</option><option>basse</option></select></label>
              <label>Poids estimé CA %<input type="number" min="0" max="100" step="0.01" value={form.estimated_revenue_share} onChange={(event) => setForm({ ...form, estimated_revenue_share: event.target.value })} /></label>
              <label>Dernier échange<input type="date" value={form.last_exchange_date} onChange={(event) => setForm({ ...form, last_exchange_date: event.target.value })} /></label>
              <label className="full-row">Notes internes<textarea rows="4" value={form.internal_notes} onChange={(event) => setForm({ ...form, internal_notes: event.target.value })} /></label>
              <div className="actions full-row">
                <button className="primary"><Save size={16} /> Enregistrer</button>
                <button type="button" onClick={() => { setForm(partnerFormFromPartner(partner)); setEditing(false); }}>Annuler</button>
              </div>
            </form>
        </Panel>
      ) : (
        <div className="overview-grid">
          <Panel title="Informations générales">
            <div className="detail-grid">
              <span>Partenaire<strong>{partner.name}</strong></span>
              <span>Société<strong>{partner.company}</strong></span>
              <span>Statut<strong><span className={`status-pill ${partner.status}`}>{partner.status}</span></strong></span>
              <span>Score santé<strong><span className={`metric-pill health-${healthTone(partner.health_score)}`}>{partner.health_score}/100</span></strong></span>
            </div>
          </Panel>
          <Panel title="Contact">
            <div className="detail-grid">
              <span>Contact principal<strong>{partner.main_contact || '-'}</strong></span>
              <span>Email<strong>{partner.email}</strong></span>
              <span>Téléphone<strong>{partner.phone || '-'}</strong></span>
              <span>Adresse<strong>{partner.address || '-'}</strong></span>
              <span>Ville / région<strong>{partner.city || '-'} · {partner.region || '-'}</strong></span>
            </div>
          </Panel>
          <Panel title="Importance business">
            <div className="detail-grid">
              <span>Priorité<strong><ImportanceBadge value={partner.business_priority} /></strong></span>
              <span>Poids CA<strong>{partner.estimated_revenue_share == null ? 'non renseigné' : percent(partner.estimated_revenue_share)}</strong></span>
              <span>Couverture catalogue<strong>{percent(stats.coverageRate)}</strong></span>
              <span>Marge moyenne<strong>{percent(stats.averageProductMargin)}</strong></span>
            </div>
          </Panel>
          <Panel title="Dernier contrôle">
            <div className="detail-grid">
              <span>Dernier benchmark<strong>{date(stats.lastCheckedAt)}</strong></span>
              <span>Anomalies prix<strong>{stats.anomalies}</strong></span>
              <span>Produits à référencer<strong>{stats.unlisted}</strong></span>
            </div>
          </Panel>
          <Panel title="Notes internes">
            <p className="padded">{partner.internal_notes || 'Aucune note interne.'}</p>
          </Panel>
        </div>
      )}
      <Panel title="Analyse automatique" action={<button onClick={generateAnalysis}><RefreshCw size={16} /> Générer</button>}>
        {analysis ? (
          <div className="analysis compact">
            <p>{analysis.summary}</p>
            <h4>Anomalies</h4><ul>{analysis.anomalies.map((item) => <li key={item}>{item}</li>)}</ul>
            <h4>Recommandations</h4><ul>{analysis.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : <p className="muted padded">Analyse automatique prête à générer un rapport enregistré.</p>}
      </Panel>
      <Panel title="Tâches liées">
        <div className="linked-tasks">
          {linkedTasks.loading && <span className="muted">Chargement...</span>}
          {!linkedTasks.loading && !linkedTasks.data?.length && <span className="muted">Aucune tâche ouverte.</span>}
          {linkedTasks.data?.map((card) => (
            <div key={card.id} className="linked-task-row">
              <Badge severity={card.priority === 'critique' || card.priority === 'haute' ? 'critique' : card.priority === 'moyenne' ? 'moyenne' : 'faible'}>{card.priority}</Badge>
              <span>
                {card.title}
                {(card.items || []).filter((item) => Number(item.completed) !== 1 && Number(item.ignored) !== 1).map((item) => <small key={item.id}>{item.label}</small>)}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function partnerFormFromPartner(partner) {
  return {
    name: partner.name || '',
    company: partner.company || '',
    email: partner.email || '',
    phone: partner.phone || '',
    address: partner.address || '',
    city: partner.city || '',
    region: partner.region || '',
    status: partner.status || 'actif',
    main_contact: partner.main_contact || '',
    internal_notes: partner.internal_notes || '',
    last_exchange_date: partner.last_exchange_date || '',
    health_score: partner.health_score ?? 70,
    business_priority: partner.business_priority || '',
    estimated_revenue_share: partner.estimated_revenue_share ?? ''
  };
}

const productDefaults = {
  contract_id: '',
  name: '',
  type: 'tandem',
  description: '',
  partner_public_price: '',
  price_4000m: '',
  partner_purchase_price: '',
  is_listed_on_4000m: 1,
  listing_status: 'référencé',
  min_margin_rate: 15,
  margin_exception_accepted: 0,
  margin_exception_reason: '',
  status: 'actif',
  valid_from: '',
  valid_to: '',
  notes: ''
};

function ProductCrud({ partnerId, products, urls = [], initialFilter = '', reload, openBenchmark }) {
  const [form, setForm] = useState(productDefaults);
  const [editingId, setEditingId] = useState(null);

  function edit(product) {
    setEditingId(product.id);
    setForm({
      contract_id: product.contract_id || '',
      name: product.name || '',
      type: product.type || 'tandem',
      description: product.description || '',
      partner_public_price: product.partner_public_price || '',
      price_4000m: product.price_4000m || '',
      partner_purchase_price: product.partner_purchase_price || '',
      is_listed_on_4000m: Number(product.is_listed_on_4000m || 0),
      listing_status: product.listing_status || 'non_référencé',
      min_margin_rate: product.min_margin_rate || 15,
      margin_exception_accepted: Number(product.margin_exception_accepted || 0),
      margin_exception_reason: product.margin_exception_reason || '',
      status: product.status || 'actif',
      valid_from: product.valid_from || '',
      valid_to: product.valid_to || '',
      notes: product.notes || ''
    });
  }

  function reset() {
    setEditingId(null);
    setForm(productDefaults);
  }

  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      partner_id: partnerId,
      contract_id: form.contract_id || null,
      description: form.description,
      partner_public_price: form.partner_public_price === '' ? null : Number(form.partner_public_price),
      price_4000m: form.price_4000m === '' ? null : Number(form.price_4000m),
      partner_purchase_price: Number(form.partner_purchase_price),
      is_listed_on_4000m: Number(form.is_listed_on_4000m),
      listing_status: form.listing_status,
      min_margin_rate: Number(form.min_margin_rate || 0),
      margin_exception_accepted: Number(form.margin_exception_accepted || 0),
      margin_exception_reason: form.margin_exception_accepted ? form.margin_exception_reason : null
    };
    await api(editingId ? `/products/${editingId}` : '/products', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    reset();
    reload();
  }

  async function remove(productId) {
    await api(`/products/${productId}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="two-col wide-left">
      <ProductCatalogTable products={products} urls={urls} initialFilter={initialFilter} edit={edit} remove={remove} openBenchmark={openBenchmark} />
      <Panel title={editingId ? 'Modifier le produit' : 'Créer un produit'}>
        <form className="compact-form" onSubmit={submit}>
          <input placeholder="Nom du produit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Description" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option>tandem</option><option>option vidéo</option><option>altitude spécifique</option><option>bon cadeau</option><option>promotion</option>
          </select>
          <div className="form-grid-3">
            <label>Prix public partenaire<input type="number" step="0.01" value={form.partner_public_price} onChange={(e) => setForm({ ...form, partner_public_price: e.target.value })} /></label>
            <label>Prix d’achat partenaire<input type="number" step="0.01" value={form.partner_purchase_price} onChange={(e) => setForm({ ...form, partner_purchase_price: e.target.value })} required /></label>
            <label>Prix affiché 4000m<input type="number" step="0.01" value={form.price_4000m} onChange={(e) => setForm({ ...form, price_4000m: e.target.value })} /></label>
          </div>
          <div className="form-grid-3">
            <ReadOnlyMargin price={form.price_4000m} purchasePrice={form.partner_purchase_price} />
            <label>Référencé 4000m<select value={form.is_listed_on_4000m} onChange={(e) => setForm({ ...form, is_listed_on_4000m: Number(e.target.value), listing_status: Number(e.target.value) ? 'référencé' : 'à_référencer' })}><option value={1}>Oui</option><option value={0}>Non</option></select></label>
            <label>Statut référencement<select value={form.listing_status} onChange={(e) => setForm({ ...form, listing_status: e.target.value })}><option>non_référencé</option><option>à_référencer</option><option>référencé</option><option>suspendu</option></select></label>
          </div>
          <div className="form-grid-3">
            <label>Seuil marge %<input type="number" step="0.01" value={form.min_margin_rate} onChange={(e) => setForm({ ...form, min_margin_rate: e.target.value })} /></label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>actif</option><option>inactif</option></select>
            <input type="date" value={form.valid_from || ''} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </div>
          <label className="checkbox-line"><input type="checkbox" checked={Number(form.margin_exception_accepted) === 1} onChange={(e) => setForm({ ...form, margin_exception_accepted: e.target.checked ? 1 : 0 })} /> Accepter cette marge comme normale</label>
          {Number(form.margin_exception_accepted) === 1 && <textarea rows="2" placeholder="Justification obligatoire de l’exception marge" value={form.margin_exception_reason || ''} onChange={(e) => setForm({ ...form, margin_exception_reason: e.target.value })} required />}
          <input type="date" value={form.valid_to || ''} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          <input placeholder="Notes" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="actions"><button className="primary"><Save size={16} /> {editingId ? 'Mettre à jour' : 'Enregistrer'}</button>{editingId && <button type="button" onClick={reset}>Annuler l’édition</button>}</div>
        </form>
      </Panel>
    </div>
  );
}

function ProductCatalogTable({ products, urls = [], initialFilter = '', edit, remove, openBenchmark }) {
  const filterFromRoute = (value) => {
    if (value === 'unlisted') return 'Non référencés';
    if (value === 'anomalies') return 'Anomalies';
    return 'Tous';
  };
  const [filter, setFilter] = useState(filterFromRoute(initialFilter));
  useEffect(() => {
    setFilter(filterFromRoute(initialFilter));
  }, [initialFilter]);
  const filtered = products.filter((product) => {
    if (filter === 'Référencés') return Number(product.is_listed_on_4000m) === 1;
    if (filter === 'Non référencés') return Number(product.is_listed_on_4000m) === 0;
    if (filter === 'À référencer') return product.listing_status === 'à_référencer';
    if (filter === 'Anomalies') return countProductAnomalies(product, urls) > 0;
    return true;
  });
  return (
    <Panel title="Produits du partenaire" action={<div className="filters">{['Tous', 'Référencés', 'Non référencés', 'À référencer', 'Anomalies'].map((item) => <button key={item} className={filter === item ? 'active-filter' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>}>
        <TableContainer className="product-table-scroll">
        <table className="data-table product-table">
          <thead><tr><th className="col-product">Produit</th><th className="col-type">Type</th><th className="col-money">Prix public partenaire</th><th className="col-money">Prix d’achat partenaire</th><th className="col-money">Prix affiché 4000m</th><th className="col-listed">Référencé 4000m</th><th className="col-money">Marge €</th><th className="col-rate">Taux de marge</th><th className="col-status">Statut référencement</th><th className="sticky-actions table-actions">Actions</th></tr></thead>
          <tbody>{filtered.map((product) => (
            <tr key={product.id} className="clickable-row" onClick={() => edit(product)}>
              <td><strong>{product.name}</strong><small>{product.description || product.notes}</small></td>
              <td>{product.type}</td>
              <td>{money(product.partner_public_price)}</td>
              <td>{money(product.partner_purchase_price)}</td>
              <td>{product.price_4000m == null ? '-' : money(product.price_4000m)}</td>
              <td>{Number(product.is_listed_on_4000m) ? 'Oui' : 'Non'}</td>
              <td>{product.margin_amount == null ? '-' : money(product.margin_amount)}</td>
              <td>
                <span className={product.margin_rate != null && Number(product.margin_rate) < 15 && Number(product.margin_exception_accepted) !== 1 ? 'danger-text' : ''}>{product.margin_rate == null ? '-' : percent(product.margin_rate)}</span>
                {product.margin_rate != null && Number(product.margin_rate) < 15 && Number(product.margin_exception_accepted) !== 1 && <small><Badge severity="critique">Anomalie marge</Badge></small>}
                {Number(product.margin_exception_accepted) === 1 && <small><Badge>Exception acceptée</Badge></small>}
              </td>
              <td><Badge>{product.listing_status}</Badge></td>
              <td className="sticky-actions">
                <div className="row-actions">
                  <button title="Éditer" aria-label="Éditer" onClick={(event) => { event.stopPropagation(); edit(product); }}><Pencil size={15} /></button>
                  <button title="Benchmark" aria-label="Benchmark" onClick={(event) => { event.stopPropagation(); openBenchmark(); }}><BarChart3 size={15} /></button>
                  <button title="Supprimer" aria-label="Supprimer" onClick={(event) => { event.stopPropagation(); remove(product.id); }}><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
        </TableContainer>
      </Panel>
  );
}

function ReadOnlyMargin({ price, purchasePrice }) {
  const priceValue = Number(price || 0);
  const purchaseValue = Number(purchasePrice || 0);
  if (price === '' || price == null || priceValue === 0) {
    return (
      <div className="readonly-margin">
        <span>Marge calculée</span>
        <strong>-</strong>
        <small>Prix 4000m manquant</small>
      </div>
    );
  }
  const amount = priceValue - purchaseValue;
  const rate = priceValue > 0 ? (amount / priceValue) * 100 : 0;
  return (
    <div className="readonly-margin">
      <span>Marge calculée</span>
      <strong>{money(amount)}</strong>
      <small>{percent(rate)}</small>
    </div>
  );
}

function formatCell(value) {
  if (value == null || value === '') return '';
  const normalized = String(value).replace(/\s/g, '').replace('€', '').replace(',', '.');
  const number = Number(normalized);
  if (Number.isFinite(number) && String(value).match(/[0-9]/)) return money(number);
  return value;
}

function ContractTab({ contracts }) {
  return (
    <Panel title="Contrats">
      <TableContainer>
      <table className="data-table">
        <thead><tr><th>Période</th><th>Commission 4000m</th><th>Prix achat</th><th>Prix conseillé</th><th>Exclusivité</th><th>Statut</th><th>Conditions</th></tr></thead>
        <tbody>{contracts.map((contract) => (
          <tr key={contract.id}>
            <td>{date(contract.start_date)}<small>au {date(contract.end_date)}</small></td>
            <td>{contract.commission_rate}%</td>
            <td>{money(contract.partner_purchase_price)}</td>
            <td>{money(contract.recommended_retail_price)}</td>
            <td>{contract.exclusivity ? 'Oui' : 'Non'}</td>
            <td><Badge>{contract.status}</Badge></td>
            <td>{contract.special_terms || '-'}</td>
          </tr>
        ))}</tbody>
      </table>
      </TableContainer>
    </Panel>
  );
}

function BenchmarkTab({ partnerId }) {
  const { data, loading, error, reload } = useData(`/benchmarks/partner/${partnerId}`, [partnerId]);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  if (loading || error) return <State loading={loading} error={error} />;

  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const cells = data?.cells || [];
  const cellMap = new Map(cells.map((cell) => [`${cell.row_id}:${cell.column_id}`, cell]));

  const updateCell = async (row, column, patch) => {
    const current = cellMap.get(`${row.id}:${column.id}`);
    await api('/benchmarks/cells', {
      method: 'PUT',
      body: JSON.stringify({
        row_id: row.id,
        column_id: column.id,
        value: patch.value ?? current?.value ?? '',
        color: patch.color ?? current?.color ?? 'none',
        source_url_id: current?.source_url_id || null
      })
    });
    reload();
  };

  const addColumn = async () => {
    const name = window.prompt('Nom de la colonne');
    if (!name) return;
    await api(`/benchmarks/partner/${partnerId}/columns`, { method: 'POST', body: JSON.stringify({ name }) });
    reload();
  };
  const addRow = async () => {
    const name = window.prompt('Nom de la ligne');
    if (!name) return;
    const requestedType = window.prompt('Type de ligne : partner, 4000m, competitor, note, custom', 'custom') || 'custom';
    const type = ['partner', '4000m', 'competitor', 'note', 'custom'].includes(requestedType) ? requestedType : 'custom';
    await api(`/benchmarks/partner/${partnerId}/rows`, { method: 'POST', body: JSON.stringify({ name, type }) });
    reload();
  };
  const renameColumn = async (column) => {
    const name = window.prompt('Renommer la colonne', column.name);
    if (!name) return;
    await api(`/benchmarks/columns/${column.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    reload();
  };
  const renameRow = async (row) => {
    const name = window.prompt('Renommer la ligne', row.name);
    if (!name) return;
    await api(`/benchmarks/rows/${row.id}`, { method: 'PUT', body: JSON.stringify({ name, type: row.type }) });
    reload();
  };
  const moveColumn = async (column, direction) => {
    const currentIndex = columns.findIndex((item) => item.id === column.id);
    const target = columns[currentIndex + direction];
    if (!target) return;
    await Promise.all([
      api(`/benchmarks/columns/${column.id}`, { method: 'PUT', body: JSON.stringify({ position: target.position }) }),
      api(`/benchmarks/columns/${target.id}`, { method: 'PUT', body: JSON.stringify({ position: column.position }) })
    ]);
    reload();
  };
  const moveRow = async (row, direction) => {
    const currentIndex = rows.findIndex((item) => item.id === row.id);
    const target = rows[currentIndex + direction];
    if (!target) return;
    await Promise.all([
      api(`/benchmarks/rows/${row.id}`, { method: 'PUT', body: JSON.stringify({ position: target.position }) }),
      api(`/benchmarks/rows/${target.id}`, { method: 'PUT', body: JSON.stringify({ position: row.position }) })
    ]);
    reload();
  };
  const importXlsx = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await api(`/benchmarks/partner/${partnerId}/import`, { method: 'POST', body: formData });
    event.target.value = '';
    reload();
  };
  const download = (kind) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    window.open(`${API_URL}/benchmarks/partner/${partnerId}/export.${kind}?token=${encodeURIComponent(token || '')}`, '_blank');
  };

  return (
    <Panel title={data?.table?.name || 'Benchmark'} action={<div className="actions"><button onClick={addColumn}><Plus size={16} /> Colonne</button><button onClick={addRow}><Plus size={16} /> Ligne</button><label className="file-button">Importer Excel<input type="file" accept=".xlsx" onChange={importXlsx} /></label><button onClick={() => download('xlsx')}>Exporter Excel</button><button onClick={() => download('csv')}>Exporter CSV</button></div>}>
      <TableContainer className="benchmark-sheet-container">
        <table className="benchmark-sheet">
          <thead>
            <tr>
              <th className="sheet-corner">Source</th>
              {columns.map((column) => (
                <th key={column.id}>
                  <div className="sheet-head-cell">
                    <button onClick={() => moveColumn(column, -1)}>←</button>
                    <span onDoubleClick={() => renameColumn(column)}>{column.name}</span>
                    <button onClick={() => moveColumn(column, 1)}>→</button>
                    <button onClick={() => { api(`/benchmarks/columns/${column.id}`, { method: 'DELETE' }).then(reload); }}><Trash2 size={13} /></button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th className="sheet-row-header">
                  <div className="sheet-row-title">
                    <button onClick={() => moveRow(row, -1)}>↑</button>
                    <span onDoubleClick={() => renameRow(row)}>{row.name}</span>
                    <select value={row.type} onChange={(event) => { api(`/benchmarks/rows/${row.id}`, { method: 'PUT', body: JSON.stringify({ type: event.target.value }) }).then(reload); }}>
                      <option value="partner">Partenaire</option>
                      <option value="4000m">4000m</option>
                      <option value="competitor">Concurrent</option>
                      <option value="note">Note</option>
                      <option value="custom">Libre</option>
                    </select>
                    <button onClick={() => moveRow(row, 1)}>↓</button>
                    <button onClick={() => { api(`/benchmarks/rows/${row.id}`, { method: 'DELETE' }).then(reload); }}><Trash2 size={13} /></button>
                  </div>
                </th>
                {columns.map((column) => {
                  const cell = cellMap.get(`${row.id}:${column.id}`);
                  const isEditing = editing === `${row.id}:${column.id}`;
                  return (
                    <td key={column.id} className={`sheet-cell color-${cell?.color || 'none'}`} onDoubleClick={() => { setEditing(`${row.id}:${column.id}`); setDraft(cell?.value || ''); }}>
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={() => { updateCell(row, column, { value: draft }); setEditing(null); }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              updateCell(row, column, { value: draft });
                              setEditing(null);
                            }
                          }}
                        />
                      ) : (
                        <div className="sheet-cell-content">
                          <span>{formatCell(cell?.value)}</span>
                          <select value={cell?.color || 'none'} onChange={(event) => updateCell(row, column, { color: event.target.value })}>
                            <option value="none">Sans</option>
                            <option value="green">Vert</option>
                            <option value="orange">Orange</option>
                            <option value="red">Rouge</option>
                            <option value="gray">Gris</option>
                          </select>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableContainer>
    </Panel>
  );
}

function PartnerOrdersTable({ orders }) {
  return (
    <Panel title="Commandes du partenaire">
      <TableContainer>
      <table className="data-table">
        <thead><tr><th>Client</th><th>Produit</th><th>Commande</th><th>Saut</th><th>Statut</th><th>Prix HT</th><th>Marge</th><th>Source</th></tr></thead>
        <tbody>{orders.map((order) => (
          <tr key={order.id}><td>{order.client_name}<small>{order.client_email}</small></td><td>{order.product_name}</td><td>{date(order.order_date)}</td><td>{date(order.jump_date)}</td><td><Badge>{order.status}</Badge></td><td>{money(order.sale_price_ht)}</td><td>{money(order.gross_margin_ht)}</td><td>{order.source}</td></tr>
        ))}</tbody>
      </table>
      </TableContainer>
    </Panel>
  );
}

function PartnerInvoicesTable({ invoices }) {
  return (
    <Panel title="Factures du partenaire">
      <TableContainer>
      <table className="data-table">
        <thead><tr><th>Période</th><th>Statut</th><th>HT</th><th>TVA</th><th>TTC</th><th>Commission 4000m</th><th>Net partenaire</th></tr></thead>
        <tbody>{invoices.map((invoice) => (
          <tr key={invoice.id}><td>{date(invoice.period_start)} - {date(invoice.period_end)}</td><td><Badge>{invoice.status}</Badge></td><td>{money(invoice.amount_ht)}</td><td>{money(invoice.vat)}</td><td>{money(invoice.amount_ttc)}</td><td>{money(invoice.commission_4000m)}</td><td>{money(invoice.partner_net_amount)}</td></tr>
        ))}</tbody>
      </table>
      </TableContainer>
    </Panel>
  );
}

function PartnerStats({ stats, orders }) {
  const bySource = orders.reduce((acc, order) => {
    acc[order.source] = (acc[order.source] || 0) + 1;
    return acc;
  }, {});
  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="CA HT" value={money(stats.revenue)} />
        <Kpi label="Marge HT" value={money(stats.margin)} />
        <Kpi label="Marge moyenne" value={`${stats.marginRate.toFixed(1)}%`} />
        <Kpi label="Commandes consommées" value={stats.consumed} />
        <Kpi label="Factures en attente" value={stats.pendingInvoices} tone="warn" />
        <Kpi label="Anomalies prix" value={stats.anomalies} tone="warn" />
      </div>
      <Panel title="Commandes par source">
        <TableContainer><table className="data-table"><tbody>{Object.entries(bySource).map(([source, count]) => <tr key={source}><td>{source}</td><td className="right">{count}</td></tr>)}</tbody></table></TableContainer>
      </Panel>
    </div>
  );
}

function Tasks() {
  const [filters, setFilters] = useState({ priority: '', type: '', status: '' });
  const query = useMemo(() => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return params.toString() ? `/tasks?${params}` : '/tasks';
  }, [filters]);
  const { data, loading, error, reload } = useData(query, [query]);
  async function setStatus(id, status) {
    await api(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    reload();
  }
  return (
    <State loading={loading} error={error}>
      <Panel title="Actions à traiter" action={<div className="filters">
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}><option value="">Toutes priorités</option><option>basse</option><option>moyenne</option><option>haute</option><option>critique</option></select>
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">Tous types</option><option>référencement</option><option>prix</option><option>marge</option><option>contrat</option><option>benchmark</option><option>facture</option></select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Ouvertes</option><option value="todo">todo</option><option value="doing">doing</option><option value="done">done</option><option value="ignored">ignored</option></select>
      </div>}>
        <TableContainer>
        <table className="data-table">
          <thead><tr><th>Priorité</th><th>Partenaire</th><th>Produit</th><th>Type</th><th>Description</th><th>Création</th><th>Statut</th><th className="table-actions"></th></tr></thead>
          <tbody>{data?.map((task) => (
            <tr key={task.id}>
              <td><Badge severity={task.priority === 'critique' || task.priority === 'haute' ? 'critique' : task.priority === 'moyenne' ? 'moyenne' : 'faible'}>{task.priority}</Badge></td>
              <td>{task.partner_name || '-'}</td>
              <td>{task.product_name || '-'}</td>
              <td>{task.type}</td>
              <td><strong>{task.title}</strong><small>{task.description}</small></td>
              <td>{date(task.created_at)}</td>
              <td><Badge>{task.status}</Badge></td>
              <td className="actions table-actions"><button onClick={() => setStatus(task.id, 'done')}>Traiter</button><button onClick={() => setStatus(task.id, 'ignored')}>Ignorer</button></td>
            </tr>
          ))}</tbody>
        </table>
        </TableContainer>
      </Panel>
    </State>
  );
}

const kanbanColumns = [
  ['todo', 'To do'],
  ['doing', 'Doing'],
  ['done', 'Done']
];

function CrmKanban({ setPage }) {
  const { data, loading, error, reload } = useData('/tasks/kanban');
  const partners = useData('/partners');
  const [draggedCard, setDraggedCard] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});

  async function updateItem(item, patch) {
    await api(`/tasks/checklist/${item.id}`, { method: 'PUT', body: JSON.stringify(patch) });
    reload();
  }

  async function moveCard(card, status) {
    if (card.status === status) return;
    await api(`/tasks/cards/${card.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    reload();
  }

  async function saveCard(payload) {
    await api(payload.id ? `/tasks/cards/${payload.id}` : '/tasks/cards', {
      method: payload.id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    setEditingCard(null);
    reload();
  }

  async function deleteCard(card) {
    if (!window.confirm('Supprimer cette card ?')) return;
    await api(`/tasks/cards/${card.id}`, { method: 'DELETE' });
    reload();
  }

  async function addChecklistItem(card) {
    const label = window.prompt('Nouvelle tâche');
    if (!label) return;
    await api(`/tasks/cards/${card.id}/checklist`, { method: 'POST', body: JSON.stringify({ label }) });
    reload();
  }

  async function editChecklistItem(item) {
    const label = window.prompt('Modifier la tâche', item.label);
    if (!label) return;
    await updateItem(item, { label });
  }

  async function deleteChecklistItem(item) {
    await api(`/tasks/checklist/${item.id}`, { method: 'DELETE' });
    reload();
  }

  async function ignoreChecklistItem(item) {
    const reason = window.prompt('Raison de l’ignorance');
    if (!reason) return;
    await updateItem(item, { ignored: 1, ignore_reason: reason });
  }

  const isItemResolved = (item) => Number(item.completed) === 1 || Number(item.ignored) === 1;

  return (
    <State loading={loading || partners.loading} error={error || partners.error}>
      <div className="stack">
        <div className="crm-board-header">
          <div>
            <h2>Gestion CRM</h2>
            <p>Pipeline des anomalies partenaires transformées en actions.</p>
          </div>
          <div className="actions">
            <button className="primary" onClick={() => setEditingCard({ status: 'todo', priority: 'moyenne', items: [] })}><Plus size={16} /> Ajouter une card</button>
            <button onClick={reload}><RefreshCw size={16} /> Actualiser</button>
          </div>
        </div>
        {editingCard && <CrmCardEditor card={editingCard} partners={partners.data || []} onSave={saveCard} onCancel={() => setEditingCard(null)} />}
        <div className="kanban-board">
          {kanbanColumns.map(([status, label]) => (
            <section
              key={status}
              className={`kanban-column ${status}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedCard && draggedCard.status !== status) moveCard(draggedCard.card, status);
                setDraggedCard(null);
              }}
            >
              <div className="kanban-column-head">
                <h3>{label}</h3>
                <span>{data?.[status]?.length || 0}</span>
              </div>
              <div className="kanban-card-list">
                {(data?.[status] || []).map((card) => {
                  const isExpanded = Boolean(expandedCards[card.id]);
                  const visibleItems = isExpanded ? card.items : card.items.slice(0, 5);
                  const hiddenCount = Math.max(card.items.length - visibleItems.length, 0);
                  return (
                    <article
                      key={card.id}
                      className="kanban-card"
                      draggable
                      onDragStart={() => setDraggedCard({ status, card })}
                      onDragEnd={() => setDraggedCard(null)}
                    >
                      <div className="kanban-card-head">
                        <strong>{card.title}</strong>
                        <Badge severity={card.priority === 'critique' || card.priority === 'haute' ? 'critique' : card.priority === 'moyenne' ? 'moyenne' : 'faible'}>{card.priority}</Badge>
                      </div>
                      <div className="kanban-card-meta">
                        <span>{card.partner_name || 'Sans partenaire'}</span>
                        <span>{card.source}</span>
                        <span>{card.items.filter(isItemResolved).length}/{card.items.length}</span>
                        {card.due_date && <span>{date(card.due_date)}</span>}
                      </div>
                      {card.description && <p>{card.description}</p>}
                      <div className="kanban-task-list">
                        {visibleItems.map((item) => (
                          <div key={item.id} className="kanban-task">
                            <input type="checkbox" checked={Number(item.completed) === 1} onChange={() => updateItem(item, { completed: !Number(item.completed) })} />
                            <span className={Number(item.ignored) === 1 ? 'task-ignored' : ''} onDoubleClick={() => editChecklistItem(item)}>
                              {item.label}
                              {item.description && <small>{item.description}</small>}
                              {item.anomaly_code && <small>{item.anomaly_code}</small>}
                              {Number(item.ignored) === 1 && <small>Ignorée : {item.ignore_reason || 'raison non renseignée'}</small>}
                            </span>
                            <button title="Ignorer" onClick={() => ignoreChecklistItem(item)}>Ignorer</button>
                            <button title="Supprimer" onClick={() => deleteChecklistItem(item)}><Trash2 size={13} /></button>
                          </div>
                        ))}
                        {hiddenCount > 0 && <button className="kanban-expand" onClick={() => setExpandedCards((current) => ({ ...current, [card.id]: true }))}>Voir {hiddenCount} tâches supplémentaires</button>}
                        {isExpanded && card.items.length > 5 && <button className="kanban-expand" onClick={() => setExpandedCards((current) => ({ ...current, [card.id]: false }))}>Réduire</button>}
                      </div>
                      <div className="kanban-card-actions card-actions">
                        {card.partner_id && <button onClick={() => setPage(`partner-detail:${card.partner_id}`)}>Ouvrir partenaire</button>}
                        <button onClick={() => setEditingCard(card)}><Pencil size={14} /> Éditer</button>
                        <button onClick={() => addChecklistItem(card)}><Plus size={14} /> Tâche</button>
                        <button onClick={() => deleteCard(card)}><Trash2 size={14} /> Supprimer</button>
                        {status !== 'todo' && <button onClick={() => moveCard(card, 'todo')}>To do</button>}
                        {status !== 'doing' && status !== 'done' && <button onClick={() => moveCard(card, 'doing')}>Doing</button>}
                        {status !== 'done' && card.items.length > 0 && card.items.every(isItemResolved) && <button className="primary" onClick={() => moveCard(card, 'done')}>Passer en Done</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </State>
  );
}

function CrmCardEditor({ card, partners, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    id: card.id,
    partner_id: card.partner_id || '',
    title: card.title || '',
    description: card.description || '',
    priority: card.priority || 'moyenne',
    status: card.status || 'todo',
    due_date: card.due_date || '',
    notes: card.notes || '',
    itemsText: (card.items || []).map((item) => `${Number(item.completed) ? '[x]' : '[ ]'} ${item.label}`).join('\n')
  }));

  function parseItems() {
    return form.itemsText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => ({
      label: line.replace(/^\[(x| )\]\s*/i, ''),
      completed: /^\[x\]/i.test(line)
    }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({
      id: form.id,
      partner_id: form.partner_id || null,
      title: form.title,
      description: form.description,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      notes: form.notes,
      items: parseItems()
    });
  }

  return (
    <Panel title={form.id ? 'Modifier la card' : 'Ajouter une card'}>
      <form className="profile-form partner-edit-form" onSubmit={submit}>
        <label>Partenaire<select value={form.partner_id} onChange={(event) => setForm({ ...form, partner_id: event.target.value })}><option value="">Sans partenaire</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
        <label>Titre<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
        <label>Priorité<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>basse</option><option>moyenne</option><option>haute</option><option>critique</option></select></label>
        <label>Statut<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="todo">todo</option><option value="doing">doing</option><option value="done">done</option></select></label>
        <label>Date d’échéance<input type="date" value={form.due_date || ''} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label>
        <label className="full-row">Description<textarea rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label className="full-row">Checklist<textarea rows="5" value={form.itemsText} onChange={(event) => setForm({ ...form, itemsText: event.target.value })} placeholder="[ ] Appeler le partenaire&#10;[x] Vérifier le prix" /></label>
        <label className="full-row">Notes<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <div className="actions full-row"><button className="primary"><Save size={16} /> Enregistrer</button><button type="button" onClick={onCancel}>Annuler</button></div>
      </form>
    </Panel>
  );
}

function HistoryTab({ alerts, checks }) {
  const events = [
    ...alerts.map((alert) => ({ id: `a-${alert.id}`, date: alert.created_at, type: `Alerte ${alert.type}`, message: alert.message, status: alert.status })),
    ...checks.slice(0, 50).map((check) => ({ id: `p-${check.id}`, date: check.checked_at, type: 'Contrôle prix', message: `${check.product_name} · ${money(check.detected_price)} · écart ${money(check.gap_with_4000m)}`, status: check.status }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <Panel title="Historique partenaire">
      <TableContainer>
      <table className="data-table">
        <thead><tr><th>Date</th><th>Type</th><th>Événement</th><th>Statut</th></tr></thead>
        <tbody>{events.map((event) => <tr key={event.id}><td>{date(event.date)}</td><td>{event.type}</td><td>{event.message}</td><td><Badge>{event.status}</Badge></td></tr>)}</tbody>
      </table>
      </TableContainer>
    </Panel>
  );
}

function Products({ partner = false }) {
  const { data, loading, error } = useData('/products');
  return (
    <State loading={loading} error={error}>
      <Panel title="Produits partenaires">
        <TableContainer>
        <table className="data-table">
          <thead><tr><th>Produit</th><th>Partenaire</th><th>Type</th><th>Prix public partenaire</th><th>Prix affiché 4000m</th><th>Prix d’achat partenaire</th>{!partner && <th>Marge €</th>}{!partner && <th>Taux de marge</th>}<th>Référencement</th><th>Statut</th></tr></thead>
          <tbody>{data?.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.partner_name}</td>
              <td>{product.type}</td>
              <td>{money(product.partner_public_price)}</td>
              <td>{product.price_4000m == null ? '-' : money(product.price_4000m)}</td>
              <td>{money(product.partner_purchase_price)}</td>
              {!partner && <td>{product.margin_amount == null ? '-' : money(product.margin_amount)}</td>}
              {!partner && <td>{product.margin_rate == null ? '-' : percent(product.margin_rate)}</td>}
              <td><Badge>{product.listing_status}</Badge></td>
              <td><Badge>{product.status}</Badge></td>
            </tr>
          ))}</tbody>
        </table>
        </TableContainer>
      </Panel>
    </State>
  );
}

function Orders({ partner = false }) {
  const [filters, setFilters] = useState({ status: '', source: '' });
  const query = useMemo(() => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return params.toString() ? `/orders?${params}` : '/orders';
  }, [filters]);
  const { data, loading, error } = useData(query, [query]);
  return (
    <State loading={loading} error={error}>
      <Panel title="Commandes" action={<div className="filters"><select onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Tous statuts</option><option>commandé</option><option>consommé</option><option>annulé</option><option>reporté</option><option>remboursé</option></select><select onChange={(e) => setFilters({ ...filters, source: e.target.value })}><option value="">Toutes sources</option><option>web</option><option>téléphone</option><option>partenaire</option><option>autre</option></select></div>}>
        <TableContainer>
        <table className="data-table">
          <thead><tr><th>Client</th><th>Produit</th><th>Partenaire</th><th>Date</th><th>Statut</th><th>Prix HT</th>{!partner && <th>Marge</th>}<th>Source</th></tr></thead>
          <tbody>{data?.map((order) => (
            <tr key={order.id}>
              <td>{order.client_name}<small>{order.client_email}</small></td>
              <td>{order.product_name}</td>
              <td>{order.partner_name || '-'}</td>
              <td>{date(order.order_date)}</td>
              <td><Badge>{order.status}</Badge></td>
              <td>{money(order.sale_price_ht)}</td>
              {!partner && <td>{money(order.gross_margin_ht)}</td>}
              <td>{order.source}</td>
            </tr>
          ))}</tbody>
        </table>
        </TableContainer>
      </Panel>
    </State>
  );
}

function Invoices({ partner = false }) {
  const { data, loading, error, reload } = useData('/invoices');
  async function setStatus(id, status) {
    await api(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    reload();
  }
  return (
    <State loading={loading} error={error}>
      <Panel title={partner ? 'Mes factures' : 'Factures partenaires'}>
        <TableContainer>
        <table className="data-table">
          <thead><tr><th>Partenaire</th><th>Période</th><th>Statut</th><th>HT</th><th>TVA</th><th>TTC</th><th>Net partenaire</th>{!partner && <th className="table-actions"></th>}</tr></thead>
          <tbody>{data?.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.partner_name}</td>
              <td>{date(invoice.period_start)} - {date(invoice.period_end)}</td>
              <td><Badge>{invoice.status}</Badge></td>
              <td>{money(invoice.amount_ht)}</td>
              <td>{money(invoice.vat)}</td>
              <td>{money(invoice.amount_ttc)}</td>
              <td>{money(invoice.partner_net_amount)}</td>
              {!partner && <td className="actions table-actions"><button onClick={() => setStatus(invoice.id, 'validé')}>Valider</button><button onClick={() => setStatus(invoice.id, 'rejeté')}>Rejeter</button></td>}
            </tr>
          ))}</tbody>
        </table>
        </TableContainer>
      </Panel>
      {partner && <CreateInvoice onCreated={reload} />}
    </State>
  );
}

function CreateInvoice({ onCreated }) {
  const { data, loading, error, reload } = useData('/orders/unbilled-consumed');
  const [selected, setSelected] = useState([]);
  async function submit() {
    const now = new Date();
    await api('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        period_end: now.toISOString().slice(0, 10),
        order_ids: selected
      })
    });
    setSelected([]);
    reload();
    onCreated();
  }
  return (
    <Panel title="Créer une demande de facture" action={<button disabled={!selected.length} onClick={submit}><FileCheck2 size={16} /> Soumettre</button>}>
      <State loading={loading} error={error}>
        <TableContainer><table className="data-table"><tbody>{data?.map((order) => (
          <tr key={order.id}>
            <td><input type="checkbox" checked={selected.includes(order.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, order.id] : selected.filter((id) => id !== order.id))} /></td>
            <td>{order.product_name}</td>
            <td>{order.client_name}</td>
            <td>{money(order.partner_price_ht)}</td>
          </tr>
        ))}</tbody></table></TableContainer>
      </State>
    </Panel>
  );
}

function Alerts() {
  const { data, loading, error, reload } = useData('/alerts');
  async function resolve(id) {
    await api(`/alerts/${id}/resolve`, { method: 'PATCH' });
    reload();
  }
  return (
    <State loading={loading} error={error}>
      <Panel title="Alertes">
        <TableContainer>
        <table className="data-table">
          <thead><tr><th>Type</th><th>Gravité</th><th>Message</th><th>Partenaire</th><th>Statut</th><th className="table-actions"></th></tr></thead>
          <tbody>{data?.map((alert) => (
            <tr key={alert.id}>
              <td>{alert.type}</td>
              <td><Badge severity={alert.severity}>{alert.severity}</Badge></td>
              <td>{alert.message}</td>
              <td>{alert.partner_name || '-'}</td>
              <td><Badge>{alert.status}</Badge></td>
              <td className="table-actions">{alert.status === 'ouverte' && <button onClick={() => resolve(alert.id)}>Traiter</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        </TableContainer>
      </Panel>
    </State>
  );
}

function PartnerHome({ user }) {
  const { data, loading, error, reload } = useData(`/partners/${user.partner_id}`);
  const [form, setForm] = useState(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  async function submit(event) {
    event.preventDefault();
    await api(`/partners/${user.partner_id}`, { method: 'PUT', body: JSON.stringify(form) });
    reload();
  }
  return (
    <State loading={loading} error={error}>
      {form && (
        <Panel title="Coordonnées partenaire">
          <form className="profile-form" onSubmit={submit}>
            {['email', 'phone', 'address', 'city', 'main_contact'].map((field) => (
              <label key={field}>{field}<input value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} /></label>
            ))}
            <button className="primary">Mettre à jour</button>
          </form>
        </Panel>
      )}
    </State>
  );
}

function Badge({ children, severity }) {
  return <span className={`badge ${severity || children}`}>{children}</span>;
}

createRoot(document.getElementById('root')).render(<App />);
