const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
function load(relative, extras = {}) {
  const filename = path.join(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require, ...extras }, { filename });
  return mod.exports;
}
const { createLedger, executeTrade, readLedger, portfolioValue, importLegacyBalance } = load('features/paper/engine.ts');
const order = (overrides = {}) => ({ symbol: 'BTC', side: 'buy', quantity: 1, price: 100, source: 'Sample prices', id: 'test', time: '2026-09-14T12:00:00Z', ...overrides });
test('buy deducts notional and fee, preserves input, and values holdings', () => {
  const original = createLedger();
  const next = executeTrade(original, order());
  assert.equal(original.cash, 100000);
  assert.equal(next.cash, 99899.9);
  assert.equal(next.positions.BTC.cost, 100.1);
  assert.equal(next.trades.length, 1);
  assert.equal(portfolioValue(next, { BTC: 100 }), 99999.9);
});
test('partial then full sale allocates cost and realizes net profit including fees', () => {
  let state = executeTrade(createLedger(), order({ quantity: 2 }));
  state = executeTrade(state, order({ side: 'sell', price: 120, quantity: 1 }));
  assert.ok(Math.abs(state.realized - 19.78) < 1e-8);
  assert.equal(state.positions.BTC.quantity, 1);
  assert.equal(state.positions.BTC.cost, 100.1);
  state = executeTrade(state, order({ side: 'sell', price: 120, quantity: 1 }));
  assert.equal(Object.keys(state.positions).length, 0);
  assert.ok(Math.abs(state.cash - 100039.56) < 1e-8);
});
test('rejects zero, negative, nonfinite, dust and invalid orders', () => {
  for (const quantity of [0, -1, NaN, Infinity, 0.000001]) assert.throws(() => executeTrade(createLedger(), order({ quantity })));
  for (const price of [0, -1, NaN, Infinity]) assert.throws(() => executeTrade(createLedger(), order({ price })));
  assert.throws(() => executeTrade(createLedger(), order({ symbol: '<script>' })));
});
test('rejects overspending including fees and short selling', () => {
  assert.throws(() => executeTrade(createLedger(), order({ quantity: 1000 })), /Insufficient/);
  assert.throws(() => executeTrade(createLedger(), order({ side: 'sell' })), /more than/);
  const state = executeTrade(createLedger(), order());
  assert.throws(() => executeTrade(state, order({ side: 'sell', quantity: 1.00000001 })), /more than/);
});
test('maximum buy keeps cash nonnegative', () => {
  const quantity = Math.floor(100000 / (77824 * 1.001) * 1e8) / 1e8;
  const state = executeTrade(createLedger(), order({ quantity, price: 77824 }));
  assert.ok(state.cash >= 0 && state.cash < 0.001);
});
test('portfolio survives serialization with trades and watchlist', () => {
  const state = executeTrade(createLedger(), order());
  assert.equal(JSON.stringify(readLedger(JSON.stringify(state))), JSON.stringify(state));
});
test('invalid saved data fails closed instead of resetting', () => {
  assert.throws(() => readLedger('{broken'));
  assert.throws(() => readLedger(JSON.stringify({ ...createLedger(), cash: -10 })));
  assert.throws(() => readLedger(JSON.stringify({ ...createLedger(), positions: { BTC: { symbol: 'BTC', quantity: -1, cost: 10, lastPrice: 20 } } })));
  assert.throws(() => readLedger(JSON.stringify({ ...createLedger(), trades: [{}] })));
});
test('legacy migration retains cash and positions without double-counting USDT', () => {
  const raw = JSON.stringify({ balance: JSON.stringify({ balance: { usdtBalance: 500, holdings: { USDT: { amount: 500 }, BTC: { symbol: 'BTC', amount: 2, averageBuyPrice: 80, currentPrice: 100 } } } }) });
  const state = importLegacyBalance(raw);
  assert.equal(state.cash, 500);
  assert.equal(state.positions.BTC.quantity, 2);
  assert.equal(state.startingValue, 700);
  assert.equal(portfolioValue(state, {}), 700);
});
test('market errors and missing quotes do not masquerade as live prices', async () => {
  const badResponse = load('features/paper/market.ts', { fetch: async () => ({ ok: false }) });
  await assert.rejects(badResponse.fetchMarket({}), /unavailable/);
  const incomplete = load('features/paper/market.ts', { fetch: async () => ({ ok: true, json: async () => [] }) });
  await assert.rejects(incomplete.fetchMarket({}), /Incomplete/);
});
test('complete live quote responses replace sample prices and validate chart values', async () => {
  const { SAMPLE_COINS } = load('features/paper/market.ts');
  const market = load('features/paper/market.ts', { fetch: async () => ({ ok: true, json: async () => SAMPLE_COINS.map(c => ({ id: c.id, current_price: 123, price_change_percentage_24h: -2, sparkline_in_7d: { price: [1, null, 3, -1] } })) }) });
  const coins = await market.fetchMarket({});
  assert.equal(coins.length, 8);
  assert.equal(coins[0].price, 123);
  assert.equal(coins[0].change, -2);
  assert.equal(JSON.stringify(coins[0].history), '[1,3]');
});
