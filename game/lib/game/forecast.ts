import { MARKET_EVENTS, type AssetId, type MarketEvent } from './data.ts';

export const FORECAST_CONFIG = {
  directionAccuracy: 0.7,
  insightBonus: 0.12,
  maxAccuracy: 0.9,
  returnVariation: 0.2,
};
export type ForecastId = 'bullish' | 'bearish' | 'uncertain' | 'recovery';
type Pattern = {
  name: string;
  signals: [string, string][];
  expected: string[];
  surprise: string[];
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
    expected: ['normal_up', 'strong_up', 'bubble'],
    surprise: ['correction', 'stagnation'],
  },
  bearish: {
    name: '弱気予報',
    signals: [
      ['景気', '悪化傾向'],
      ['市場心理', '慎重'],
      ['金利', '上昇傾向'],
      ['ボラティリティ', '高め'],
    ],
    expected: ['correction', 'crash', 'severe_crash'],
    surprise: ['stagnation', 'normal_up', 'recovery'],
  },
  uncertain: {
    name: '不透明予報',
    signals: [
      ['景気', '方向感なし'],
      ['市場心理', '様子見'],
      ['金利', '不透明'],
      ['ボラティリティ', 'やや高い'],
    ],
    expected: ['stagnation', 'inflation', 'rate_hike'],
    surprise: ['normal_up', 'correction'],
  },
  recovery: {
    name: '回復予報',
    signals: [
      ['景気', '底打ちの兆候'],
      ['市場心理', '改善'],
      ['金利', '落ち着きつつある'],
      ['ボラティリティ', 'まだ高い'],
    ],
    expected: ['recovery', 'normal_up'],
    surprise: ['stagnation', 'crash'],
  },
};
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
  let remaining = roll * entries.reduce((sum, e) => sum + e.weight, 0);
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
    let weight = event.weight;
    if (last === 'crash' || last === 'severe_crash') {
      if (event.id === 'recovery') weight *= 2.5;
      if (event.id === 'bubble') weight *= 0.3;
      if (event.id === 'strong_up') weight *= 1.3;
    }
    if (last === 'bubble') {
      if (event.id === 'correction') weight *= 1.5;
      if (event.id === 'crash') weight *= 1.8;
      if (event.id === 'severe_crash') weight *= 1.5;
    }
    if (last === 'strong_up' && event.id === 'bubble') weight *= 1.4;
    if (event.id === last) weight *= before === last ? 0 : 0.35;
    return { id: event.id, weight };
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
  const ids = matches ? pattern.expected : pattern.surprise;
  const bucketRoll = matches
    ? roll / forecast.accuracy
    : (roll - forecast.accuracy) / (1 - forecast.accuracy);
  const weights = getAdjustedEventWeights(history).filter((e) =>
    ids.includes(e.id),
  );
  return weightedPick(
    weights.map((e) => ({ value: e.id, weight: e.weight })),
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
  const matched = FORECAST_PATTERNS[forecast.id].expected.includes(eventId);
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
    forecast:
      s.phase === 'forecast' && s.forecast
        ? {
            name: FORECAST_PATTERNS[s.forecast.id].name,
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
