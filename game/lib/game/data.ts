export const GAME_CONFIG = {
  totalTurns: 20,
  targetAssets: 3_000_000,
  initialTotal: 1_000_000,
  initialInvested: 800_000,
  initialCash: 200_000,
  buyMoreCashRatio: 0.5,
  panicCashoutRatio: 0.9,
  panicReentryRatio: 0.3,
};
export const ASSETS = {
  allWorld: {
    id: 'allWorld',
    name: 'オルカン',
    type: 'バランス',
    description: '世界中に、少しずつ。',
    strong: '幅広い分散',
    weak: '一点突破は苦手',
    dividendRate: 0,
    icon: 'globe',
    color: '#7cc0cf',
  },
  sp500: {
    id: 'sp500',
    name: 'S&P500',
    type: '成長型',
    description: '市場とともに、着実な成長を。',
    strong: '上昇・好景気',
    weak: '暴落',
    dividendRate: 0,
    icon: 'compass',
    color: '#8fb7ed',
  },
  nasdaq: {
    id: 'nasdaq',
    name: 'NASDAQ100',
    type: '攻撃型',
    description: '大きな波を、大きなリターンに。',
    strong: '好景気・バブル',
    weak: '暴落・金利上昇',
    dividendRate: 0,
    icon: 'sparkles',
    color: '#b6a2ed',
  },
  dividend: {
    id: 'dividend',
    name: '高配当株',
    type: '安定収益',
    description: '毎年の配当を、次の力に。',
    strong: '配当 年1.5%',
    weak: '急成長は控えめ',
    dividendRate: 0.015,
    icon: 'coins',
    color: '#82c9b1',
  },
  gold: {
    id: 'gold',
    name: 'ゴールド',
    type: '防御',
    description: '荒れる相場で、輝く守り。',
    strong: '暴落・インフレ',
    weak: '好景気・市場回復',
    dividendRate: 0,
    icon: 'gem',
    color: '#dab77c',
  },
  bonds: {
    id: 'bonds',
    name: '債券',
    type: '超防御',
    description: '波を抑えて、長い旅を支える。',
    strong: '暴落への耐性',
    weak: '金利上昇・インフレ',
    dividendRate: 0,
    icon: 'shield',
    color: '#a8bdca',
  },
} as const;
export type AssetId = keyof typeof ASSETS;
export type MarketEvent = {
  id: string;
  name: string;
  category: string;
  weight: number;
  description: string;
  returns: Record<AssetId, number>;
};
const assetIds = Object.keys(ASSETS) as AssetId[];
const make = (
  id: string,
  name: string,
  category: string,
  weight: number,
  values: number[],
  description: string,
): MarketEvent => ({
  id,
  name,
  category,
  weight,
  description,
  returns: Object.fromEntries(
    assetIds.map((a, i) => [a, values[i] / 100]),
  ) as Record<AssetId, number>,
});
export const MARKET_EVENTS: MarketEvent[] = [
  make(
    'normal_up',
    '緩やかな上昇相場',
    '通常',
    26,
    [9, 12, 16, 4, 0, 2],
    '市場は穏やかな上昇を続けています。投資家心理も安定しています。',
  ),
  make(
    'strong_up',
    '好景気',
    '強気',
    11,
    [15, 20, 28, 8, -2, 1],
    '企業業績が好調です。市場には楽観ムードが広がっています。',
  ),
  make(
    'bubble',
    'バブル',
    '強気',
    6,
    [19, 30, 48, 10, -5, 0],
    '市場が熱狂しています。「まだ上がる」という声があちこちから聞こえます。',
  ),
  make(
    'correction',
    '調整局面',
    '弱気',
    13,
    [-7, -8, -13, -6, 2, 2],
    '利益確定売りが広がっています。市場は一時的な調整局面に入りました。',
  ),
  make(
    'crash',
    '暴落',
    '暴落',
    7,
    [-19, -25, -32, -17, 12, 4],
    '株式市場が急落しています。投資家の間に不安が広がっています。',
  ),
  make(
    'severe_crash',
    '歴史的大暴落',
    '暴落',
    2,
    [-29, -38, -47, -26, 18, 7],
    '世界市場が混乱しています。歴史に残る規模の下落が発生しました。',
  ),
  make(
    'recovery',
    '市場回復',
    '回復',
    10,
    [18, 26, 38, 9, -6, 1],
    '市場に買いが戻っています。底打ちを期待する動きが広がっています。',
  ),
  make(
    'rate_hike',
    '金利上昇',
    'マクロ',
    6,
    [-4, -5, -15, -3, 1, -5],
    '中央銀行が政策金利を引き上げました。市場の資金環境が変化しています。',
  ),
  make(
    'inflation',
    'インフレ',
    'マクロ',
    5,
    [0, -2, -4, 3, 12, -6],
    '物価上昇が加速しています。市場ではインフレへの警戒が強まっています。',
  ),
  make(
    'stagnation',
    '景気停滞',
    '中立',
    14,
    [3, 3, -1, 5, 2, 3],
    '景気は方向感を欠いています。市場も様子見ムードです。',
  ),
];
// Shown on the setup screen instead of raw percentages: a 1-5 relative rating
// derived from the return table, so it stays true whenever the table is tuned.
export const RATING_LABELS = {
  growth: '成長性',
  stability: '安定性',
  resilience: '暴落耐性',
} as const;
export type RatingKey = keyof typeof RATING_LABELS;
export const RATING_MAX = 5;
export const ASSET_RATINGS: Record<AssetId, Record<RatingKey, number>> = (() => {
  const total = MARKET_EVENTS.reduce((sum, e) => sum + e.weight, 0);
  const crashes = MARKET_EVENTS.filter((e) => e.category === '暴落');
  const crashTotal = crashes.reduce((sum, e) => sum + e.weight, 0);
  const raw = Object.fromEntries(
    assetIds.map((id) => {
      const mean =
        MARKET_EVENTS.reduce((sum, e) => sum + e.weight * e.returns[id], 0) /
        total;
      const variance =
        MARKET_EVENTS.reduce(
          (sum, e) => sum + e.weight * (e.returns[id] - mean) ** 2,
          0,
        ) / total;
      return [
        id,
        {
          growth: mean + ASSETS[id].dividendRate,
          stability: -Math.sqrt(variance),
          resilience:
            crashes.reduce((sum, e) => sum + e.weight * e.returns[id], 0) /
            crashTotal,
        },
      ];
    }),
  ) as Record<AssetId, Record<RatingKey, number>>;
  const scaled = {} as Record<AssetId, Record<RatingKey, number>>;
  for (const id of assetIds) scaled[id] = {} as Record<RatingKey, number>;
  for (const key of Object.keys(RATING_LABELS) as RatingKey[]) {
    const values = assetIds.map((id) => raw[id][key]);
    const low = Math.min(...values);
    const span = Math.max(...values) - low;
    for (const id of assetIds)
      scaled[id][key] = span
        ? Math.round(1 + (RATING_MAX - 1) * ((raw[id][key] - low) / span))
        : RATING_MAX;
  }
  return scaled;
})();
export const DECISIONS = {
  panic: '狼狽売り',
  hold: 'ホールド',
  buyMore: '買い増し',
} as const;
export type Decision = keyof typeof DECISIONS;
// Calibrated against simulated runs: a plain 20-year hold lands around B,
// skilled play around A–S, and SS needs both good judgement and a good market.
export const RANKS = [
  { min: 6_000_000, rank: 'SS' },
  { min: 4_000_000, rank: 'S' },
  { min: 2_500_000, rank: 'A' },
  { min: 1_500_000, rank: 'B' },
  { min: 1_000_000, rank: 'C' },
  { min: 1, rank: 'D' },
  { min: 0, rank: 'F' },
];
