import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createLedger, executeTrade, FEE_RATE, importLegacyBalance, Ledger, portfolioValue, readLedger, Side, STORAGE_KEY } from '@/features/paper/engine';
import { Coin, fetchMarket, SAMPLE_COINS } from '@/features/paper/market';
import { workspaceCSS } from './workspaceStyles';

type Page = 'Overview' | 'Markets' | 'Portfolio' | 'Activity' | 'Watchlist';
const pages: Page[] = ['Overview', 'Markets', 'Portfolio', 'Activity', 'Watchlist'];
const QUOTE_STORAGE_KEY = 'chrysos.quotes.v1';
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 }).format(n);
const amount = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    Overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    Markets: <><path d="M4 19V5m0 14h16M7 14l4-4 4 3 5-7"/></>,
    Portfolio: <><path d="M12 3v9h9A9 9 0 1 1 12 3Z"/><path d="M16 3a8 8 0 0 1 5 5h-5Z"/></>,
    Activity: <><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/></>,
    Watchlist: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></>,
    shield: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.Markets}</svg>;
}

function Sparkline({ values, positive }: { values?: number[]; positive: boolean }) {
  if (!values || values.length < 2) return <span className="pc-no-chart">No chart data</span>;
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 112},${28 - ((v - min) / span) * 24}`).join(' ');
  return <svg className="pc-spark" viewBox="0 0 112 32" role="img" aria-label="Price movement over the past seven days"><polyline points={points} fill="none" stroke={positive ? '#61d6aa' : '#ef8a94'} strokeWidth="1.5"/></svg>;
}

export default function PaperWorkspace() {
  const [page, setPage] = useState<Page>('Overview');
  const [ledger, setLedger] = useState<Ledger>(createLedger);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [coins, setCoins] = useState<Coin[]>(SAMPLE_COINS);
  const [quoteTime, setQuoteTime] = useState<number | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState('BTC');
  const [side, setSide] = useState<Side>('buy');
  const [quantity, setQuantity] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('default');
  const [notice, setNotice] = useState('');
  const [orderError, setOrderError] = useState('');
  const [hideBalance, setHideBalance] = useState(false);
  const [preview, setPreview] = useState<{ coin: Coin; side: Side; quantity: number; source: string; quoteTime: number | null } | null>(null);
  const ledgerRef = useRef(ledger);
  const requestRef = useRef<AbortController | null>(null);
  const ticketRef = useRef<HTMLElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const live = quoteTime !== null && now - quoteTime < 90_000;
  const source = quoteTime === null ? 'Sample prices' : live ? 'Live prices' : 'Cached prices';

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const initial = saved ? readLedger(saved) : importLegacyBalance(window.localStorage.getItem('persist:root'));
      // Ensure persistence works before enabling orders.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      ledgerRef.current = initial;
      setLedger(initial);
      try {
        const cached = JSON.parse(window.localStorage.getItem(QUOTE_STORAGE_KEY) || 'null');
        if (cached && Number.isFinite(cached.time) && cached.time <= Date.now() && Array.isArray(cached.coins) &&
            SAMPLE_COINS.every(c => cached.coins.some((q: Coin) => q.id === c.id && Number.isFinite(q.price) && q.price > 0))) {
          setCoins(SAMPLE_COINS.map(c => {
            const q = cached.coins.find((item: Coin) => item.id === c.id);
            return { ...c, price: q.price, change: Number.isFinite(q.change) ? q.change : null,
              history: Array.isArray(q.history) && q.history.every((n: number) => Number.isFinite(n) && n > 0) ? q.history : undefined };
          }));
          setQuoteTime(cached.time);
        }
      } catch { /* A bad quote cache does not invalidate the saved account. */ }
      const path = window.location.pathname;
      if (path.includes('portfolio')) setPage('Portfolio');
      else if (path.includes('watchlist')) setPage('Watchlist');
      else if (path.includes('history')) setPage('Activity');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Browser storage is unavailable. Enable it to save your paper trades.');
    }
    setReady(true);
    const changed = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      try {
        if (!event.newValue) throw new Error('Portfolio storage changed in another tab. Reload before trading.');
        const updated = readLedger(event.newValue);
        ledgerRef.current = updated;
        setLedger(updated);
        setPreview(null);
      } catch { setStorageError('Portfolio storage changed in another tab. Reload before trading.'); }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  async function refreshQuotes() {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 10_000);
    setLoadingQuotes(true);
    try {
      const prices = await fetchMarket(controller.signal);
      setCoins(prices); setQuoteTime(Date.now()); setNow(Date.now()); setQuoteError('');
      try { window.localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify({ time: Date.now(), coins: prices })); } catch { /* Quotes remain available in memory. */ }
    } catch {
      if (!controller.signal.aborted || requestRef.current) setQuoteError('Live market data is unavailable. You can practice with the displayed prices.');
    } finally {
      clearTimeout(timer); requestRef.current = null; setLoadingQuotes(false);
    }
  }

  useEffect(() => {
    void refreshQuotes();
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => { clearInterval(tick); requestRef.current?.abort(); requestRef.current = null; };
  }, []);

  useEffect(() => {
    if (preview) confirmRef.current?.focus();
  }, [preview]);

  const prices = useMemo(() => Object.fromEntries(coins.map(c => [c.symbol, c.price])), [coins]);
  const value = portfolioValue(ledger, prices);
  const invested = value - ledger.cash;
  const pnl = value - ledger.startingValue;
  const positions = Object.values(ledger.positions);
  const coin = coins.find(c => c.symbol === selected) || coins[0];
  const qty = Number(quantity);
  const orderValue = Number.isFinite(qty) && qty > 0 ? qty * coin.price : 0;
  const visibleCoins = coins.filter(c => (page !== 'Watchlist' || ledger.watchlist.includes(c.symbol)) && `${c.name} ${c.symbol}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'price' ? b.price - a.price : sort === 'change' ? (b.change || 0) - (a.change || 0) : 0);
  const display = (n: number) => hideBalance ? '••••••' : money(n);

  function save(next: Ledger) {
    if (storageError) throw new Error('Trading is paused until browser storage is available.');
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    ledgerRef.current = next; setLedger(next);
  }
  function latestLedger() {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) throw new Error('Saved portfolio is missing. Reload before trading.');
    return readLedger(saved);
  }
  function toggleWatch(symbol: string) {
    try {
      const current = latestLedger();
      save({ ...current, watchlist: current.watchlist.includes(symbol) ? current.watchlist.filter(s => s !== symbol) : [...current.watchlist, symbol] });
    } catch { setStorageError('Unable to save your watchlist. Check browser storage and reload.'); }
  }
  function chooseAsset(symbol: string, orderSide: Side = 'buy') {
    setSelected(symbol); setSide(orderSide); setQuantity(''); setOrderError(''); setNotice('');
    ticketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    quantityRef.current?.focus({ preventScroll: true });
  }
  function fillPercent(percent: number) {
    const max = side === 'buy' ? ledger.cash / (coin.price * (1 + FEE_RATE)) : ledger.positions[coin.symbol]?.quantity || 0;
    const result = Math.floor(max * percent * 1e8) / 1e8;
    setQuantity(String(result)); setOrderError('');
  }
  function reviewOrder(event: React.FormEvent) {
    event.preventDefault(); setNotice(''); setOrderError('');
    try {
      if (!ready || storageError) throw new Error('Your paper account is not ready.');
      const current = latestLedger();
      executeTrade(current, { symbol: coin.symbol, side, quantity: qty, price: coin.price, source, id: 'validation', time: new Date().toISOString() });
      setPreview({ coin: { ...coin }, side, quantity: qty, source, quoteTime });
    } catch (error) { setOrderError(error instanceof Error ? error.message : 'Unable to prepare this order.'); }
  }
  async function confirmOrder() {
    if (!preview || busy.current) return;
    busy.current = true;
    try {
      if (preview.quoteTime !== null && preview.source === 'Live prices' && Date.now() - preview.quoteTime > 90_000) throw new Error('The quote expired. Refresh prices and review your order again.');
      const commit = () => {
        const current = latestLedger();
        const next = executeTrade(current, { symbol: preview.coin.symbol, side: preview.side, quantity: preview.quantity, price: preview.coin.price, source: preview.source, id: window.crypto.randomUUID(), time: new Date().toISOString() });
        save(next);
      };
      // Serialize orders from multiple tabs sharing this browser account.
      if (navigator.locks) await navigator.locks.request(STORAGE_KEY, commit);
      else commit();
      setNotice(`Paper ${preview.side} filled: ${amount(preview.quantity)} ${preview.coin.symbol} at ${money(preview.coin.price)}.`);
      setQuantity(''); setPreview(null); setOrderError('');
    } catch (error) { setOrderError(error instanceof Error ? error.message : 'Could not save the order. No trade was recorded.'); setPreview(null); }
    finally { busy.current = false; quantityRef.current?.focus(); }
  }
  function exportTrades() {
    const lines = ['Time,Side,Asset,Quantity,Price USD,Fee USD,Realized PnL USD,Price source', ...ledger.trades.map(t => [t.time, t.side, t.symbol, t.quantity, t.price, t.fee, t.realized, t.source].join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'chrysos-paper-trades.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="pc-app">
    <style>{workspaceCSS}</style>
    <a className="pc-skip" href="#pc-content">Skip to content</a>
    <aside className="pc-sidebar">
      <a className="pc-brand" href="#" onClick={e => { e.preventDefault(); setPage('Overview'); }} aria-label="Chrysos overview"><span className="pc-logo">χ</span><span>chrysos<span className="pc-brand-sub">PAPER TRADING</span></span></a>
      <div className="pc-nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{pages.map(p => <button key={p} className={`pc-nav ${page === p ? 'active' : ''}`} aria-current={page === p ? 'page' : undefined} onClick={() => { setPage(p); setSearch(''); }}><Icon name={p}/><span>{p}</span>{p === 'Watchlist' && <small>{ledger.watchlist.length}</small>}</button>)}</nav>
      <div className="pc-sidebar-bottom"><div className="pc-practice"><Icon name="shield"/><strong>Room to learn.</strong><p>Build your confidence.<br/>Every trade is practice.</p><span>$100,000 starting capital</span></div><div className="pc-account"><span className="pc-avatar">P</span><div><strong>Practice account</strong><small>Saved in this browser</small></div><span className="pc-dot"/></div></div>
    </aside>
    <div className="pc-workspace">
      <header className="pc-topbar"><div className="pc-breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div><div className="pc-top-actions"><span className="pc-mode"><Icon name="shield" size={14}/> Paper mode</span><span className="pc-avatar">P</span></div></header>
      <main id="pc-content" className="pc-main">
        <div className="pc-page-heading"><div><div className="pc-eyebrow">YOUR TRADING SANDBOX</div><h1>{page === 'Overview' ? 'A little practice. A better trader.' : page}</h1><p>{page === 'Overview' ? 'Explore the market. Test your ideas. Keep the lessons.' : page === 'Portfolio' ? 'Your positions, cash, and progress in one place.' : page === 'Activity' ? 'Every practice trade, with the details that matter.' : page === 'Watchlist' ? 'A closer look at the assets on your radar.' : 'Find your next opportunity to practice.'}</p></div><button className="pc-button pc-secondary" onClick={() => void refreshQuotes()} disabled={loadingQuotes}><Icon name="refresh" size={16}/>{loadingQuotes ? 'Refreshing…' : 'Refresh prices'}</button></div>
        {storageError && <div className="pc-alert" role="alert">{storageError} <button onClick={() => window.location.reload()}>Reload account</button></div>}
        <div className="pc-metrics">
          <section className="pc-metric pc-total"><div className="pc-metric-label">Total paper equity <button className="pc-icon-button" aria-label={hideBalance ? 'Show balances' : 'Hide balances'} aria-pressed={hideBalance} onClick={() => setHideBalance(!hideBalance)}><Icon name="eye" size={16}/></button></div><div className="pc-metric-value">{display(value)}</div><span className={`pc-metric-foot ${pnl < 0 ? 'negative' : 'positive'}`}>{hideBalance ? '••••' : signed(pnl)} <span>since starting</span></span><div className="pc-equity-decoration" aria-hidden="true"/></section>
          <section className="pc-metric"><div className="pc-metric-label">Available to trade <Icon name="Activity" size={16}/></div><div className="pc-metric-value">{display(ledger.cash)}</div><span className="pc-metric-foot">Paper USD <span>· Ready when you are</span></span></section>
          <section className="pc-metric"><div className="pc-metric-label">Invested in crypto <Icon name="Portfolio" size={16}/></div><div className="pc-metric-value">{display(invested)}</div><span className="pc-metric-foot">{positions.length} {positions.length === 1 ? 'asset' : 'assets'} <span>in your portfolio</span></span></section>
        </div>
        <div className="pc-grid">
          <div className="pc-primary-column">
            {page === 'Overview' && <section className="pc-strategy"><div className="pc-strategy-symbol"><Icon name="Markets" size={28}/></div><div><span className="pc-eyebrow">MAKE YOUR NEXT MOVE</span><h2>Your strategy starts with a single trade.</h2><p>Choose an asset, set your size, and see how your idea plays out.</p></div><button className="pc-text-button" onClick={() => chooseAsset('BTC')}>Trade Bitcoin <Icon name="arrow" size={17}/></button></section>}
            {(page === 'Overview' || page === 'Markets' || page === 'Watchlist') && <section className="pc-panel">
              <div className="pc-panel-heading"><div><h2>{page === 'Watchlist' ? 'Your watchlist' : 'Market watch'} <span className="pc-count">{visibleCoins.length}</span></h2><p>USD pairs <span className="pc-divider">/</span> {source}</p></div><span className={`pc-status ${live ? 'is-live' : ''}`}><i/>{loadingQuotes ? 'Connecting' : quoteTime ? live ? 'Live' : 'Cached' : 'Sample'}</span></div>
              <div className="pc-table-tools"><label className="pc-search"><Icon name="search" size={17}/><input aria-label="Search assets" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or symbol"/></label><select aria-label="Sort assets" value={sort} onChange={e => setSort(e.target.value)}><option value="default">Popular assets</option><option value="price">Price: high to low</option><option value="change">24h: high to low</option></select></div>
              <div className="pc-table-wrap"><table className="pc-market-table"><thead><tr><th scope="col">Asset</th><th scope="col">Price</th><th scope="col">24h change</th><th scope="col" className="pc-chart-column">Last 7 days</th><th scope="col"><span className="pc-sr">Actions</span></th></tr></thead><tbody>{visibleCoins.map(c => <tr key={c.symbol} className={selected === c.symbol ? 'selected' : ''}><td><button className="pc-asset" onClick={() => chooseAsset(c.symbol)}><span className="pc-coin" style={{ color: c.color, background: `${c.color}18` }}>{c.mark}</span><span><strong>{c.name}</strong><small>{c.symbol}</small></span></button></td><td className="pc-numeric">{money(c.price)}</td><td className={c.change === null ? 'pc-muted' : c.change >= 0 ? 'positive' : 'negative'}>{c.change === null ? '—' : `${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%`}</td><td className="pc-chart-column"><Sparkline values={c.history} positive={(c.change || 0) >= 0}/></td><td><div className="pc-row-actions"><button className={`pc-icon-button ${ledger.watchlist.includes(c.symbol) ? 'starred' : ''}`} aria-label={`${ledger.watchlist.includes(c.symbol) ? 'Remove' : 'Add'} ${c.name} ${ledger.watchlist.includes(c.symbol) ? 'from' : 'to'} watchlist`} aria-pressed={ledger.watchlist.includes(c.symbol)} onClick={() => toggleWatch(c.symbol)} disabled={!ready || !!storageError}><Icon name="Watchlist" size={16}/></button><button className="pc-trade-small" onClick={() => chooseAsset(c.symbol)}>Trade</button></div></td></tr>)}</tbody></table></div>
              {visibleCoins.length === 0 && <div className="pc-empty"><Icon name={page === 'Watchlist' ? 'Watchlist' : 'search'} size={28}/><h3>{search ? 'No matching assets' : 'Make this space yours'}</h3><p>{search ? 'Try a symbol such as BTC, or clear your search.' : 'Star assets in Markets to keep them close.'}</p><button className="pc-text-button" onClick={() => { setSearch(''); if (page === 'Watchlist') setPage('Markets'); }}>{search ? 'Clear search' : 'Explore markets'} <Icon name="arrow" size={16}/></button></div>}
              <div className="pc-data-note">{quoteTime ? `CoinGecko · Updated ${new Date(quoteTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. ${!live ? 'Cached quotes are used for practice fills.' : 'Quotes may differ from exchange execution prices.'}` : 'Sample quotes for offline practice. These are not current market prices.'}{quoteError && <span>{quoteError}</span>}</div>
            </section>}
            {page === 'Portfolio' && <section className="pc-panel"><div className="pc-panel-heading"><div><h2>Your holdings</h2><p>Cost basis includes trading fees</p></div><span className="pc-status">{positions.length} positions</span></div>{positions.length ? <div className="pc-table-wrap"><table><thead><tr><th>Asset</th><th>Quantity</th><th>Value</th><th>Unrealized P&L</th><th><span className="pc-sr">Action</span></th></tr></thead><tbody>{positions.map(p => { const currentValue = p.quantity * (prices[p.symbol] || p.lastPrice); return <tr key={p.symbol}><td><strong>{p.symbol}</strong></td><td>{amount(p.quantity)}</td><td>{display(currentValue)}</td><td className={currentValue >= p.cost ? 'positive' : 'negative'}>{hideBalance ? '••••' : signed(currentValue - p.cost)}</td><td>{coins.some(c => c.symbol === p.symbol) ? <button className="pc-trade-small" onClick={() => chooseAsset(p.symbol, 'sell')}>Sell</button> : <span className="pc-muted">Imported</span>}</td></tr>; })}</tbody></table></div> : <div className="pc-empty"><Icon name="Portfolio" size={32}/><h3>A blank slate. Plenty of possibility.</h3><p>Your first paper trade will appear here.</p><button className="pc-button pc-gold" onClick={() => setPage('Markets')}>Explore markets <Icon name="arrow" size={16}/></button></div>}<div className="pc-data-note">Realized P&L: {hideBalance ? '••••' : signed(ledger.realized)} · {source}. Imported assets without a quote use their last saved price.</div></section>}
            {page === 'Activity' && <section className="pc-panel"><div className="pc-panel-heading"><div><h2>Trade history</h2><p>Orders placed in this browser workspace</p></div><button className="pc-button pc-secondary" disabled={!ledger.trades.length} onClick={exportTrades}>Export CSV</button></div>{ledger.trades.length ? <div className="pc-table-wrap"><table><thead><tr><th>Order</th><th>Quantity</th><th>Fill price</th><th>Fee</th><th>Time</th></tr></thead><tbody>{ledger.trades.map(t => <tr key={t.id}><td><span className={`pc-side-tag ${t.side}`}>{t.side}</span> <strong>{t.symbol}</strong><small className="pc-source-cell">{t.source}</small></td><td>{amount(t.quantity)}</td><td>{money(t.price)}</td><td>{money(t.fee)}</td><td className="pc-muted">{new Date(t.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td></tr>)}</tbody></table></div> : <div className="pc-empty"><Icon name="Activity" size={32}/><h3>Your trading journal starts here.</h3><p>Completed orders will include their fill price, fee, and price source.</p><button className="pc-text-button" onClick={() => chooseAsset('BTC')}>Place a practice trade <Icon name="arrow" size={16}/></button></div>}</section>}
            {page === 'Overview' && <div className="pc-bottom-grid"><section className="pc-panel pc-allocation"><div className="pc-panel-heading"><h2>Portfolio mix</h2><Icon name="Portfolio" size={18}/></div><div className="pc-allocation-bar" aria-label={`${value ? (ledger.cash / value * 100).toFixed(1) : '0'} percent in cash`}><span style={{ width: `${value ? ledger.cash / value * 100 : 0}%` }}/></div><div className="pc-allocation-labels"><span><i className="cash"/>Cash <strong>{value ? (ledger.cash / value * 100).toFixed(1) : '0'}%</strong></span><span><i className="crypto"/>Crypto <strong>{value ? (invested / value * 100).toFixed(1) : '0'}%</strong></span></div><button className="pc-text-button" onClick={() => setPage('Portfolio')}>View portfolio <Icon name="arrow" size={16}/></button></section><section className="pc-panel pc-recent"><div className="pc-panel-heading"><h2>Last trade</h2><Icon name="Activity" size={18}/></div>{ledger.trades[0] ? <><h3>{ledger.trades[0].side === 'buy' ? 'Bought' : 'Sold'} {amount(ledger.trades[0].quantity)} {ledger.trades[0].symbol}</h3><p>{money(ledger.trades[0].price)} per coin · {ledger.trades[0].source}</p></> : <><h3>No trades yet</h3><p>Every experienced trader started somewhere.</p></>}<button className="pc-text-button" onClick={() => setPage('Activity')}>View activity <Icon name="arrow" size={16}/></button></section></div>}
          </div>
          <aside className="pc-ticket-column"><section className="pc-panel pc-ticket" ref={ticketRef} aria-label="Paper trading ticket"><div className="pc-panel-heading"><h2>Quick trade</h2><span className="pc-ticket-badge">PAPER</span></div><form onSubmit={reviewOrder}><div className="pc-side-switch" role="group" aria-label="Order side"><button type="button" aria-pressed={side === 'buy'} className={side === 'buy' ? 'buy-active' : ''} onClick={() => { setSide('buy'); setQuantity(''); setOrderError(''); }}>Buy</button><button type="button" aria-pressed={side === 'sell'} className={side === 'sell' ? 'sell-active' : ''} onClick={() => { setSide('sell'); setQuantity(''); setOrderError(''); }}>Sell</button></div><label className="pc-field-label" htmlFor="pc-asset-select">Asset</label><select id="pc-asset-select" className="pc-asset-select" value={selected} onChange={e => chooseAsset(e.target.value, side)}>{coins.map(c => <option value={c.symbol} key={c.symbol}>{c.name} · {c.symbol}</option>)}</select><div className="pc-quote"><span>{coin.symbol} / USD</span><strong>{money(coin.price)}</strong></div><div className="pc-field-heading"><label className="pc-field-label" htmlFor="pc-quantity">Quantity</label><span>Market order</span></div><div className="pc-quantity"><input id="pc-quantity" ref={quantityRef} value={quantity} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" onChange={e => { if (/^\d*\.?\d{0,8}$/.test(e.target.value)) setQuantity(e.target.value); setOrderError(''); }} aria-describedby="pc-order-error"/><span>{coin.symbol}</span></div><div className="pc-percentages">{[0.25, 0.5, 0.75, 1].map(p => <button type="button" key={p} onClick={() => fillPercent(p)}>{p === 1 ? 'Max' : `${p * 100}%`}</button>)}</div><div className="pc-available"><span>Available</span><strong>{side === 'buy' ? display(ledger.cash) : `${amount(ledger.positions[coin.symbol]?.quantity || 0)} ${coin.symbol}`}</strong></div><div className="pc-order-summary"><div><span>Order value</span><strong>{money(orderValue)}</strong></div><div><span>Trading fee <small>(0.1%)</small></span><strong>{money(orderValue * FEE_RATE)}</strong></div><div className="pc-order-total"><span>{side === 'buy' ? 'Total cost' : 'You receive'}</span><strong>{money(orderValue * (side === 'buy' ? 1 + FEE_RATE : 1 - FEE_RATE))}</strong></div></div><button className={`pc-button pc-submit ${side === 'sell' ? 'pc-sell' : 'pc-gold'}`} disabled={!ready || !!storageError || orderValue < 0.01} type="submit">Review {side} order <Icon name="arrow" size={17}/></button><div id="pc-order-error" className="pc-order-error" role="alert">{orderError}</div>{notice && <div className="pc-success" role="status"><Icon name="check" size={17}/>{notice}</div>}<p className="pc-ticket-note"><Icon name="shield" size={14}/>Virtual funds. Real practice.<br/>{source} · No real assets are purchased.</p></form></section><div className="pc-learning"><span className="pc-eyebrow">THE PRACTICE NOTE</span><h3>Start small. Stay curious.</h3><p>Try a small position first. Watch how price changes affect your equity, then review your trade history.</p><span>01 <span className="pc-learning-line"/> LEARN BY DOING</span></div></aside>
        </div>
        <footer className="pc-footer"><span>CHRYSOS <span>·</span> A space to practice.</span><span>Local paper account <span>·</span> No deposit required</span></footer>
      </main>
    </div>
    {preview && <div className="pc-modal-backdrop" onKeyDown={e => { if (e.key === 'Escape') { setPreview(null); quantityRef.current?.focus(); } if (e.key === 'Tab') { e.preventDefault(); const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button'); const index = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); } }}><section className="pc-modal" role="dialog" aria-modal="true" aria-labelledby="pc-review-title"><span className="pc-mode">PAPER ORDER</span><h2 id="pc-review-title">Review your {preview.side}</h2><p>{amount(preview.quantity)} {preview.coin.symbol} at {money(preview.coin.price)} per coin</p><div className="pc-review-source">{preview.source}{preview.source !== 'Live prices' && ' · This fill uses practice pricing, not a current live quote.'}</div><div className="pc-order-summary"><div><span>Fee</span><strong>{money(preview.quantity * preview.coin.price * FEE_RATE)}</strong></div><div className="pc-order-total"><span>{preview.side === 'buy' ? 'Total paper cost' : 'Paper cash received'}</span><strong>{money(preview.quantity * preview.coin.price * (preview.side === 'buy' ? 1 + FEE_RATE : 1 - FEE_RATE))}</strong></div></div><div className="pc-modal-actions"><button className="pc-button pc-secondary" onClick={() => { setPreview(null); quantityRef.current?.focus(); }}>Cancel</button><button className="pc-button pc-gold" ref={confirmRef} onClick={() => void confirmOrder()}>Confirm paper {preview.side}</button></div></section></div>}
  </div>;
}
