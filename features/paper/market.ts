export type Coin = { id: string; symbol: string; name: string; price: number; change: number | null; color: string; mark: string; history?: number[] };
// Explicit sample quotes for offline practice, never presented as live prices.
export const SAMPLE_COINS: Coin[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 65000, change: null, color: '#f7931a', mark: '₿' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3500, change: null, color: '#899ff4', mark: 'Ξ' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', price: 150, change: null, color: '#9d82ee', mark: '◎' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', price: 600, change: null, color: '#edc34a', mark: '◇' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', price: 0.6, change: null, color: '#dbe2eb', mark: '×' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', price: 0.15, change: null, color: '#c6ad64', mark: 'Ð' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', price: 15, change: null, color: '#6c8ff5', mark: '⬡' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', price: 35, change: null, color: '#ec737c', mark: '△' },
];

export async function fetchMarket(signal: AbortSignal): Promise<Coin[]> {
  const ids = SAMPLE_COINS.map(c => c.id).join(',');
  const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h`, { signal });
  if (!response.ok) throw new Error('Market provider is unavailable');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid quote response');
  return SAMPLE_COINS.map(coin => {
    const live = data.find(d => d.id === coin.id);
    if (!live || !Number.isFinite(live.current_price) || live.current_price <= 0) throw new Error('Incomplete market prices');
    return { ...coin, price: live.current_price, change: Number.isFinite(live.price_change_percentage_24h) ? live.price_change_percentage_24h : null,
      history: Array.isArray(live.sparkline_in_7d?.price) ? live.sparkline_in_7d.price.filter((p: number) => Number.isFinite(p) && p > 0) : undefined };
  });
}
