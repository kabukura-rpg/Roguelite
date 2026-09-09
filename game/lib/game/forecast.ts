import { MARKET_EVENTS, type AssetId, type MarketEvent } from './data.ts';

export const FORECAST_CONFIG = {
  directionAccuracy: 0.7,
  insightBonus: 0.12,
  maxAccuracy: 0.9,
  returnVariation: 0.2,
};
export type ForecastId = 'bullish' | 'bearish' | 'uncertain' | 'recovery';
// Each bucket carries its own weights. Using the global MARKET_EVENTS weights here
// distorted the realised distribution, because an event that appears in several
// buckets was drawn far more often than its own weight (see FORECAST_MIX below).
type Bucket = [string, number][];
type Pattern = {
  name: string;
  signals: [string, string][];
  expected: Bucket;
  surprise: Bucket;
};
export const FORECAST_PATTERNS: Record<ForecastId, Pattern> = {
  bullish: {
    name: '強気予報',
    signals: [
      ['景気', '上向きの兆候'],
      ['市場心理', '強気寄り'],
      ['金利', '安定'],
      ['ボラティリティ', '落ち着いている'],
    ],
    expected: [
      ['normal_up', 38],
      ['strong_up', 40],
      ['bubble', 22],
    ],
    surprise: [
      ['correction', 45],
      ['stagnation', 55],
    ],
  },
  bearish: {
    name: '弱気予報',
    signals: [
      ['景気', '悪化傾向'],
      ['市場心理', '慎重'],
      ['金利', '上昇傾向'],
      ['ボラティリティ', '高め'],
    ],
    expected: [
      ['correction', 55],
      ['crash', 33],
      ['severe_crash', 12],
    ],
    surprise: [
      ['stagnation', 30],
      ['normal_up', 45],
      ['recovery', 25],
    ],
  },
  uncertain: {
    name: '不透明予報',
    signals: [
      ['景気', '方向感なし'],
      ['市場心理', '様子見'],
      ['金利', '不透明'],
      ['ボラティリティ', 'やや高い'],
    ],
    expected: [
      ['stagnation', 34],
      ['inflation', 30],
      ['rate_hike', 36],
    ],
    surprise: [
      ['normal_up', 75],
      ['correction', 25],
    ],
  },
  recovery: {
    name: '回復予報',
    signals: [
      ['景気', '底打ちの兆候'],
      ['市場心理', '改善'],
      ['金利', '落ち着きつつある'],
      ['ボラティリティ', 'まだ高い'],
    ],
    expected: [
      ['recovery', 60],
      ['normal_up', 40],
    ],
    surprise: [
      ['stagnation', 60],
      ['crash', 40],
    ],
  },
};
export const forecastEvents = (bucket: Bucket) => bucket.map(([id]) => id);
export type Forecast = {
  id: ForecastId;
  accuracy: number;
  enhanced: boolean;
};
export type ForecastHistory = { marketEvent: string }[];

function weightedPick<T>(
  entries: { value: T; weight: number }[],
  roll: number,
): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  // Every candidate can be suppressed at once (three of the same market in a row),
  // so fall back to the last entry instead of reading past the end of the list.
  if (total <= 0) return entries.at(-1)!.value;
  let remaining = roll * total;
  for (const e of entries) {
    remaining -= e.weight;
    if (remaining < 0) return e.value;
  }
  return entries.filter((e) => e.weight > 0).at(-1)!.value;
}

// Observations are generated first; this function never selects an actual event.
export function generateForecast(
  roll: number,
  history: ForecastHistory = [],
  accuracyBonus = 0,
): Forecast {
  const last = history.at(-1)?.marketEvent;
  const afterCrash = last === 'crash' || last === 'severe_crash';
  const id = weightedPick<ForecastId>(
    [
      { value: 'bullish', weight: 30 },
      { value: 'bearish', weight: last === 'bubble' ? 40 : 25 },
      { value: 'uncertain', weight: 25 },
      { value: 'recovery', weight: afterCrash ? 45 : 20 },
    ],
    roll,
  );
  return {
    id,
    accuracy: Math.max(
      0,
      Math.min(
        FORECAST_CONFIG.maxAccuracy,
        FORECAST_CONFIG.directionAccuracy + accuracyBonus,
      ),
    ),
    enhanced: accuracyBonus > 0,
  };
}

export function getAdjustedEventWeights(history: ForecastHistory) {
  const last = history.at(-1)?.marketEvent;
  const before = history.at(-2)?.marketEvent;
  return MARKET_EVENTS.map((event) => {
    let factor = 1;
    if (last === 'crash' || last === 'severe_crash') {
      if (event.id === 'recovery') factor *= 2.5;
      if (event.id === 'bubble') factor *= 0.3;
      if (event.id === 'strong_up') factor *= 1.3;
    }
    if (last === 'bubble') {
      if (event.id === 'correction') factor *= 1.5;
      if (event.id === 'crash') factor *= 1.8;
      if (event.id === 'severe_crash') factor *= 1.5;
    }
    if (last === 'strong_up' && event.id === 'bubble') factor *= 1.4;
    if (event.id === last) factor *= before === last ? 0 : 0.35;
    // `factor` lets a forecast bucket apply the same history rules to its own weights.
    return { id: event.id, weight: event.weight * factor, factor };
  });
}

// Bucket probability stays stable even when history changes individual event weights.
export function selectActualMarketEvent(
  forecast: Forecast,
  roll: number,
  history: ForecastHistory = [],
): string {
  const pattern = FORECAST_PATTERNS[forecast.id];
  const matches = roll < forecast.accuracy;
  const bucket = matches ? pattern.expected : pattern.surprise;
  const bucketRoll = matches
    ? roll / forecast.accuracy
    : (roll - forecast.accuracy) / (1 - forecast.accuracy);
  const adjusted = getAdjustedEventWeights(history);
  return weightedPick(
    bucket.map(([id, weight]) => ({
      value: id,
      weight: weight * (adjusted.find((e) => e.id === id)?.factor ?? 1),
    })),
    bucketRoll,
  );
}

// A common market shock scales the existing asset return table, preserving asset traits.
export function calculateMarketReturn(
  event: MarketEvent,
  roll: number,
): Record<AssetId, number> {
  const factor = 1 + (roll * 2 - 1) * FORECAST_CONFIG.returnVariation;
  return Object.fromEntries(
    Object.entries(event.returns).map(([asset, rate]) => [
      asset,
      Math.round(rate * factor * 1000) / 1000,
    ]),
  ) as Record<AssetId, number>;
}

export function compareForecast(forecast: Forecast, eventId: string) {
  const matched = forecastEvents(FORECAST_PATTERNS[forecast.id].expected).includes(
    eventId,
  );
  const message =
    forecast.id === 'uncertain'
      ? matched
        ? '方向感の乏しい予報から、市場の動きが明らかに。'
        : '様子見の予報から、市場が動き出した。'
      : matched
        ? forecast.id === 'bearish'
          ? '慎重な予報どおり、売りが広がった。'
          : '予報どおり、市場に買いが広がった。'
        : eventId === 'stagnation'
          ? '予報とは違い、市場は足踏み。'
          : forecast.id === 'bearish'
            ? '慎重な予報に反して、市場は反発！'
            : '上向きの予報に反して、売りが広がった！';
  return { matched, message };
}

// Shared by UI and WebMCP; no outcome is observable before commitment.
export function publicMarketInfo(s: {
  phase: string;
  forecast: Forecast | null;
  eventId: string | null;
  history: {
    forecast: Forecast | null;
    marketEvent: string;
    baseReturn: number;
    effectiveReturn: number;
    turn: number;
  }[];
  turn: number;
}) {
  const result = s.history.at(-1);
  return {
    // The pattern name is an internal classification: players read the raw
    // observations and draw their own conclusion, so it is never published.
    forecast:
      s.phase === 'forecast' && s.forecast
        ? {
            signals: FORECAST_PATTERNS[s.forecast.id].signals,
            enhanced: s.forecast.enhanced,
          }
        : undefined,
    market:
      result?.turn === s.turn && s.phase !== 'forecast'
        ? result.marketEvent
        : undefined,
    marketResult:
      result?.turn === s.turn && s.phase !== 'forecast' ? result : undefined,
  };
}
