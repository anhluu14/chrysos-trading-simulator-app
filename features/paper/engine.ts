export const STARTING_CASH = 100_000;
export const FEE_RATE = 0.001;
export const STORAGE_KEY = 'chrysos.paper.v1';
export type Side = 'buy' | 'sell';
export type Position = { symbol: string; quantity: number; cost: number; lastPrice: number };
export type Trade = { id: string; symbol: string; side: Side; quantity: number; price: number; fee: number; time: string; source: string; realized: number };
export type Ledger = { version: 1; cash: number; startingValue: number; positions: Record<string, Position>; trades: Trade[]; watchlist: string[]; realized: number };
export const createLedger = (): Ledger => ({ version: 1, cash: STARTING_CASH, startingValue: STARTING_CASH, positions: {}, trades: [], watchlist: ['BTC', 'ETH', 'SOL'], realized: 0 });
const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function readLedger(raw: string): Ledger {
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !nonnegative(value.cash) || !nonnegative(value.startingValue) ||
      !Number.isFinite(value.realized) || !value.positions || typeof value.positions !== 'object' || Array.isArray(value.positions) ||
      !Array.isArray(value.trades) || !Array.isArray(value.watchlist) || !value.watchlist.every((s: unknown) => typeof s === 'string')) {
    throw new Error('Your saved portfolio could not be read. It has been preserved; trading is paused.');
  }
  for (const [symbol, position] of Object.entries(value.positions) as [string, Position][]) {
    if (!position || position.symbol !== symbol || !nonnegative(position.quantity) || !nonnegative(position.cost) || !nonnegative(position.lastPrice))
      throw new Error('A saved holding is invalid. Your portfolio has been preserved.');
  }
  for (const t of value.trades) {
    if (!t || typeof t.id !== 'string' || typeof t.symbol !== 'string' || !['buy', 'sell'].includes(t.side) ||
        !nonnegative(t.quantity) || !nonnegative(t.price) || !nonnegative(t.fee) || !Number.isFinite(t.realized) ||
        typeof t.source !== 'string' || !Number.isFinite(Date.parse(t.time))) throw new Error('Saved trade history is invalid. Your portfolio has been preserved.');
  }
  return value;
}

/** Import existing browser holdings once, without modifying the old storage. */
export function importLegacyBalance(raw: string | null): Ledger {
  const ledger = createLedger();
  if (!raw) return ledger;
  const root = JSON.parse(raw);
  const balance = JSON.parse(root.balance || 'null')?.balance;
  if (!balance) return ledger;
  if (!nonnegative(balance.usdtBalance)) throw new Error('The existing cash balance is invalid. Import is paused.');
  ledger.cash = balance.usdtBalance;
  for (const [key, h] of Object.entries(balance.holdings || {}) as [string, any][]) {
    const symbol = String(h.symbol || key).toUpperCase();
    if (symbol === 'USDT') continue;
    if (!nonnegative(h.amount) || !nonnegative(h.averageBuyPrice) || !nonnegative(h.currentPrice))
      throw new Error('An existing holding could not be imported. Your original data has been preserved.');
    if (h.amount > 0) ledger.positions[symbol] = { symbol, quantity: h.amount, cost: h.amount * h.averageBuyPrice, lastPrice: h.currentPrice };
  }
  // Track performance from the imported portfolio's opening value.
  ledger.startingValue = ledger.cash + Object.values(ledger.positions).reduce((n, p) => n + p.quantity * p.lastPrice, 0);
  return ledger;
}

/** Pure, atomic cash/position update. Fees are included in the cost basis. */
export function executeTrade(ledger: Ledger, input: { symbol: string; side: Side; quantity: number; price: number; source: string; id: string; time: string }): Ledger {
  const { symbol, side, quantity, price } = input;
  if (!/^[A-Z0-9]{1,16}$/.test(symbol) || !['buy', 'sell'].includes(side)) throw new Error('Choose a valid asset and order side.');
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) throw new Error('Enter a quantity greater than zero.');
  const total = quantity * price;
  if (!Number.isFinite(total) || total < 0.01) throw new Error('The minimum order value is $0.01.');
  const fee = total * FEE_RATE;
  const current = ledger.positions[symbol];
  const next = { ...ledger, positions: { ...ledger.positions } };
  let realized = 0;
  if (side === 'buy') {
    if (total + fee > ledger.cash + 1e-8) throw new Error('Insufficient paper cash, including the 0.1% fee.');
    next.cash = Math.max(0, ledger.cash - total - fee);
    next.positions[symbol] = { symbol, quantity: (current?.quantity || 0) + quantity, cost: (current?.cost || 0) + total + fee, lastPrice: price };
  } else {
    if (!current || quantity > current.quantity) throw new Error('You cannot sell more than you hold.');
    const costSold = current.cost * (quantity / current.quantity);
    realized = total - fee - costSold;
    next.cash = ledger.cash + total - fee;
    const remaining = current.quantity - quantity;
    if (remaining <= 1e-12) delete next.positions[symbol];
    else next.positions[symbol] = { ...current, quantity: remaining, cost: current.cost - costSold, lastPrice: price };
  }
  next.realized = ledger.realized + realized;
  next.trades = [{ ...input, fee, realized }, ...ledger.trades];
  return next;
}

export function portfolioValue(ledger: Ledger, prices: Record<string, number>): number {
  return ledger.cash + Object.values(ledger.positions).reduce((n, p) => n + p.quantity * (prices[p.symbol] || p.lastPrice), 0);
}
