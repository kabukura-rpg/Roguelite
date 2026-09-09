export const GAME_CONFIG = {
  totalTurns: 20,
  targetAssets: 3_000_000,
  initialTotal: 1_000_000,
  initialInvested: 800_000,
  initialCash: 200_000,
  buyMoreCashRatio: 0.5,
  panicCashoutRatio: 0.9,
  panicReentryRatio: 0.3,
  brokerFeeRate: 0.01,
  brokerMinimumFee: 5000,
};
export const ASSETS = {
  sp500: {
    id: 'sp500',
    name: 'S&P500',
    type: 'バランス',
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
    type: '成長重視',
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
  forecast: [string, string][];
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
  forecast: [string, string][],
): MarketEvent => ({
  id,
  name,
  category,
  weight,
  description,
  forecast,
  returns: Object.fromEntries(
    assetIds.map((a, i) => [a, values[i] / 100]),
  ) as Record<AssetId, number>,
});
const bull: [string, string][] = [
  ['景気', '上向き'],
  ['市場心理', '強気'],
  ['リスク', '低〜中'],
];
const crash: [string, string][] = [
  ['景気', '急速に悪化'],
  ['市場心理', '不安定'],
  ['リスク', '非常に高い'],
];
export const MARKET_EVENTS: MarketEvent[] = [
  make(
    'normal_up',
    '緩やかな上昇相場',
    '通常',
    20,
    [8, 11, 6, 2, 2],
    '市場は穏やかな上昇を続けています。投資家心理も安定しています。',
    [
      ['景気', '緩やかに改善'],
      ['市場心理', '安定'],
      ['リスク', '低'],
    ],
  ),
  make(
    'strong_up',
    '好景気',
    '強気',
    13,
    [15, 22, 10, 0, 1],
    '企業業績が好調です。市場には楽観ムードが広がっています。',
    bull,
  ),
  make(
    'bubble',
    'バブル',
    '強気',
    7,
    [22, 35, 14, -3, 0],
    '市場が熱狂しています。「まだ上がる」という声があちこちから聞こえます。',
    bull,
  ),
  make(
    'correction',
    '調整局面',
    '弱気',
    15,
    [-10, -14, -7, 3, 3],
    '利益確定売りが広がっています。市場は一時的な調整局面に入りました。',
    [
      ['景気', 'やや悪化'],
      ['市場心理', '慎重'],
      ['リスク', '中'],
    ],
  ),
  make(
    'crash',
    '暴落',
    '暴落',
    10,
    [-30, -40, -22, 10, 7],
    '株式市場が急落しています。投資家の間に不安が広がっています。',
    crash,
  ),
  make(
    'severe_crash',
    '歴史的大暴落',
    '暴落',
    3,
    [-45, -58, -35, 18, 12],
    '世界市場が混乱しています。歴史に残る規模の下落が発生しました。',
    crash,
  ),
  make(
    'recovery',
    '市場回復',
    '回復',
    10,
    [20, 30, 15, -4, 1],
    '市場に買いが戻っています。底打ちを期待する動きが広がっています。',
    [
      ['景気', '底打ちの兆し'],
      ['市場心理', '改善'],
      ['リスク', '中'],
    ],
  ),
  make(
    'rate_hike',
    '金利上昇',
    'マクロ',
    8,
    [-8, -18, -4, 2, -6],
    '中央銀行が政策金利を引き上げました。市場の資金環境が変化しています。',
    [
      ['金利', '上昇傾向'],
      ['景気', '不透明'],
      ['市場心理', '慎重'],
    ],
  ),
  make(
    'inflation',
    'インフレ',
    'マクロ',
    7,
    [-3, -5, 2, 15, -8],
    '物価上昇が加速しています。市場ではインフレへの警戒が強まっています。',
    [
      ['物価', '上昇'],
      ['金利', '不透明'],
      ['関心', '実物資産'],
    ],
  ),
  make(
    'stagnation',
    '景気停滞',
    '中立',
    7,
    [1, -2, 4, 4, 3],
    '景気は方向感を欠いています。市場も様子見ムードです。',
    [
      ['景気', '横ばい'],
      ['市場心理', '様子見'],
      ['リスク', '低〜中'],
    ],
  ),
];
export const DECISIONS = {
  panic: '狼狽売り',
  hold: 'ホールド',
  buyMore: '買い増し',
} as const;
export type Decision = keyof typeof DECISIONS;
export const RANKS = [
  { min: 3_500_000, rank: 'SS' },
  { min: 2_500_000, rank: 'S' },
  { min: 1_800_000, rank: 'A' },
  { min: 1_300_000, rank: 'B' },
  { min: 1_000_000, rank: 'C' },
  { min: 1, rank: 'D' },
  { min: 0, rank: 'F' },
];
