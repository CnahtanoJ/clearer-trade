export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketDataResult = {
  candles: Candle[];
  dataSource: string;
  interval: string;
};

const CRYPTO_TIMEFRAMES = [
  { label: '5m', hl: '5m', binance: '5m', bybit: '5' },
  { label: '15m', hl: '15m', binance: '15m', bybit: '15' },
  { label: '1h', hl: '1h', binance: '1h', bybit: '60' },
  { label: '4h', hl: '4h', binance: '4h', bybit: '240' },
  { label: '1d', hl: '1d', binance: '1d', bybit: 'D' },
];

const YAHOO_TIMEFRAMES = [
  { label: '5m', yahoo: '5m', gapAddSec: 259200 },
  { label: '15m', yahoo: '15m', gapAddSec: 259200 },
  { label: '1h', yahoo: '1h', gapAddSec: 432000 },
  { label: '1d', yahoo: '1d', gapAddSec: 864000 },
];

function isCrypto(symbol: string): boolean {
  return /USD|USDT|USDC|BTC|ETH|SOL|BNB/i.test(symbol) && !symbol.includes('=X');
}

function normalizeYahooSymbol(symbol: string): string {
  // If it's 6 letters and no USD/USDT, it might be forex. E.g. EURUSD
  if (symbol.length === 6 && !symbol.includes('USD') && !symbol.includes('USDT') && !symbol.includes('USDC') && /^[A-Z]{6}$/i.test(symbol)) {
    return `${symbol.toUpperCase()}=X`;
  }
  return symbol.toUpperCase();
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHyperliquid(symbol: string, interval: string, startMs: number, endMs: number, signal?: AbortSignal): Promise<Candle[]> {
  const coin = symbol.replace(/USDT|USDC|USD/i, '');
  const res = await fetchWithTimeout('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin, interval, startTime: startMs, endTime: endMs }
    }),
    signal
  }, 5000);
  if (!res.ok) throw new Error('Hyperliquid fetch failed');
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((c: { t: number; o: string; h: string; l: string; c: string; v: string }) => ({
    timestamp: c.t,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

async function fetchBinanceVision(symbol: string, interval: string, startMs: number, endMs: number, signal?: AbortSignal): Promise<Candle[]> {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${startMs}&endTime=${endMs}&limit=1000`;
  const res = await fetchWithTimeout(url, { signal }, 5000);
  if (!res.ok) throw new Error('Binance Vision fetch failed');
  const data = await res.json();
  return data.map((c: (string | number)[]) => ({
    timestamp: c[0] as number,
    open: parseFloat(c[1] as string),
    high: parseFloat(c[2] as string),
    low: parseFloat(c[3] as string),
    close: parseFloat(c[4] as string),
    volume: parseFloat(c[5] as string),
  }));
}

async function fetchBybit(symbol: string, interval: string, startMs: number, endMs: number, signal?: AbortSignal): Promise<Candle[]> {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol.toUpperCase()}&interval=${interval}&start=${startMs}&end=${endMs}&limit=1000`;
  const res = await fetchWithTimeout(url, { signal }, 5000);
  if (!res.ok) throw new Error('Bybit fetch failed');
  const data = await res.json();
  if (data.retCode !== 0 || !data.result || !data.result.list) return [];
  return data.result.list.map((c: string[]) => ({
    timestamp: parseInt(c[0]),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  })).reverse();
}

async function fetchBinancePrimary(symbol: string, interval: string, startMs: number, endMs: number, signal?: AbortSignal): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${startMs}&endTime=${endMs}&limit=1000`;
  const res = await fetchWithTimeout(url, { signal }, 5000);
  if (!res.ok) throw new Error('Binance Primary fetch failed');
  const data = await res.json();
  return data.map((c: (string | number)[]) => ({
    timestamp: c[0] as number,
    open: parseFloat(c[1] as string),
    high: parseFloat(c[2] as string),
    low: parseFloat(c[3] as string),
    close: parseFloat(c[4] as string),
    volume: parseFloat(c[5] as string),
  }));
}

async function fetchYahooFinance(symbol: string, interval: string, startMs: number, endMs: number, gapAddSec: number, signal?: AbortSignal): Promise<Candle[]> {
  const ySymbol = normalizeYahooSymbol(symbol);
  const period1 = Math.floor(startMs / 1000);
  let period2 = Math.floor(endMs / 1000);
  if (period2 - period1 < gapAddSec) {
    period2 = period1 + gapAddSec;
  }
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySymbol}?interval=${interval}&period1=${period1}&period2=${period2}`;
  const res = await fetchWithTimeout(url, { signal }, 5000);
  if (!res.ok) throw new Error('Yahoo Finance fetch failed');
  const data = await res.json();
  
  if (!data.chart || !data.chart.result || !data.chart.result[0]) return [];
  
  const result = data.chart.result[0];
  if (!result.timestamp || !result.indicators.quote[0]) return [];
  
  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.open[i] !== null && quote.close[i] !== null) {
      candles.push({
        timestamp: timestamps[i] * 1000,
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i] || 0,
      });
    }
  }
  
  return candles.filter(c => c.timestamp >= startMs - (30 * 60 * 1000) && c.timestamp <= endMs + gapAddSec * 1000);
}

export async function fetchMarketDataCascade(symbol: string, startMs: number, endMs: number, signal?: AbortSignal): Promise<MarketDataResult | null> {
  const isCrypt = isCrypto(symbol);
  const errors: string[] = [];
  
  if (isCrypt) {
    for (const tf of CRYPTO_TIMEFRAMES) {
      if (signal?.aborted) break;
      // 1. Hyperliquid
      try {
        const candles = await fetchHyperliquid(symbol, tf.hl, startMs, endMs, signal);
        if (candles.length > 0) return { candles, dataSource: 'hyperliquid', interval: tf.label };
      } catch (err: unknown) {
        errors.push(`Hyperliquid (${tf.label}): ${(err as Error)?.message || String(err)}`);
      }
      
      if (signal?.aborted) break;
      // 2. Binance Vision
      try {
        const candles = await fetchBinanceVision(symbol, tf.binance, startMs, endMs, signal);
        if (candles.length > 0) return { candles, dataSource: 'binance_vision', interval: tf.label };
      } catch (err: unknown) {
        errors.push(`Binance Vision (${tf.label}): ${(err as Error)?.message || String(err)}`);
      }
      
      if (signal?.aborted) break;
      // 3. Bybit
      try {
        const candles = await fetchBybit(symbol, tf.bybit, startMs, endMs, signal);
        if (candles.length > 0) return { candles, dataSource: 'bybit', interval: tf.label };
      } catch (err: unknown) {
        errors.push(`Bybit (${tf.label}): ${(err as Error)?.message || String(err)}`);
      }
      
      if (signal?.aborted) break;
      // 4. Binance Primary
      try {
        const candles = await fetchBinancePrimary(symbol, tf.binance, startMs, endMs, signal);
        if (candles.length > 0) return { candles, dataSource: 'binance', interval: tf.label };
      } catch (err: unknown) {
        errors.push(`Binance Primary (${tf.label}): ${(err as Error)?.message || String(err)}`);
      }
    }
  } else {
    for (const tf of YAHOO_TIMEFRAMES) {
      if (signal?.aborted) break;
      try {
        const candles = await fetchYahooFinance(symbol, tf.yahoo, startMs, endMs, tf.gapAddSec, signal);
        if (candles.length > 0) return { candles, dataSource: 'yahoo', interval: tf.label };
      } catch (err: unknown) {
        errors.push(`Yahoo Finance (${tf.label}): ${(err as Error)?.message || String(err)}`);
      }
    }
  }
  
  if (errors.length > 0) {
    console.warn(`Market data cascade failed for symbol '${symbol}'. Provider errors:`, errors.slice(0, 4).join('; '));
  }
  return null;
}
