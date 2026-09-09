import { ASSETS, type AssetId } from './data.ts';

export const CORE_ASSETS = ['allWorld', 'sp500', 'nasdaq'] as const;
export type CoreAssetId = (typeof CORE_ASSETS)[number];
export const SATELLITE_ASSETS = ['dividend', 'gold', 'bonds'] as const;
export type SatelliteId = (typeof SATELLITE_ASSETS)[number];
export const PORTFOLIO_CONFIG = {
  maxSatellites: 2,
  satelliteWeight: 0.2,
  growthYears: [4, 8, 12, 16] as readonly number[],
  offerCount: 3,
  lifeExpenseReduction: 0.1,
  annualContribution: 20_000,
  contributionInvested: 10_000,
  dividendReinvestmentRatio: 0.5,
  cashThreshold: 0.1,
  cashTopUp: 10_000,
};
export const LONG_TERM_STRATEGIES = {
  emergencyFund: {
    name: '生活防衛資金',
    icon: 'shield',
    summary: '生活イベント支出 −10%',
    description:
      '怪我・家電故障などの必要経費を10%軽減。現金優先で支払い、不足分だけ投資資産を売却します。',
    color: '#91b9ed',
  },
  contributions: {
    name: '積立投資',
    icon: 'layers',
    summary: '毎年20,000円を積立',
    description:
      '次の年から、年初に投資資産へ10,000円・現金へ10,000円を追加。年間の総資産が20,000円増えます。',
    color: '#87cdb4',
  },
  reinvestment: {
    name: '配当再投資',
    icon: 'coins',
    summary: '高配当株の配当を半分再投資',
    description:
      '高配当株から受け取る配当の50%を投資資産へ戻し、残りは現金へ。戦略カード「配当金」は対象外。高配当株を組み入れた年から有効です。',
    color: '#dab77c',
  },
  cashManagement: {
    name: '現金管理',
    icon: 'wallet',
    summary: '現金不足なら翌年 +10,000円',
    description:
      '年末の出来事を終えた時点で現金比率が10%未満なら、翌年の開始時に現金10,000円を補充します。',
    color: '#baa5ed',
  },
} as const;
export type PolicyId = keyof typeof LONG_TERM_STRATEGIES;
export type GrowthId = SatelliteId | PolicyId;
export type Allocation = { assetId: AssetId; weight: number };
export type GrowthRecord = { turn: number; choiceId: GrowthId };
export type PortfolioState = {
  satellites: SatelliteId[];
  longTermStrategies: PolicyId[];
  growthChoices: GrowthId[];
  growthHistory: GrowthRecord[];
  growthRng: number;
  cashTopUpPending: boolean;
  fundedTurn: number;
  yearStartFunding: {
    contribution: number;
    cashTopUp: number;
    totalAfter: number;
  };
};
export const isCoreAsset = (id: string): id is CoreAssetId =>
  (CORE_ASSETS as readonly string[]).includes(id);
export const isSatellite = (id: string): id is SatelliteId =>
  (SATELLITE_ASSETS as readonly string[]).includes(id);
export const isPolicy = (id: string): id is PolicyId =>
  Object.hasOwn(LONG_TERM_STRATEGIES, id);
export function createPortfolio(seed: number): PortfolioState {
  return {
    satellites: [],
    longTermStrategies: [],
    growthChoices: [],
    growthHistory: [],
    growthRng: (seed ^ 0xc43798ab) >>> 0,
    cashTopUpPending: false,
    fundedTurn: 0,
    yearStartFunding: { contribution: 0, cashTopUp: 0, totalAfter: 0 },
  };
}
// Ratios describe invested assets only. A legacy save may retain its original
// single defensive asset; new games are restricted to CORE_ASSETS by the reducer.
export function portfolioAllocation(
  core: AssetId,
  satellites: readonly SatelliteId[] = [],
): Allocation[] {
  return [
    {
      assetId: core,
      weight: 1 - satellites.length * PORTFOLIO_CONFIG.satelliteWeight,
    },
    ...satellites.map((assetId) => ({
      assetId,
      weight: PORTFOLIO_CONFIG.satelliteWeight,
    })),
  ];
}
export function portfolioReturn(
  allocation: readonly Allocation[],
  returns: Record<AssetId, number>,
): number {
  return allocation.reduce(
    (sum, position) => sum + position.weight * returns[position.assetId],
    0,
  );
}
export function portfolioDividend(
  invested: number,
  allocation: readonly Allocation[],
): number {
  const rate = allocation.reduce(
    (sum, p) => sum + p.weight * ASSETS[p.assetId].dividendRate,
    0,
  );
  return Math.max(0, Math.round(invested * rate));
}
export function dividendReinvestment(
  dividend: number,
  enabled: boolean,
): number {
  return enabled
    ? Math.round(dividend * PORTFOLIO_CONFIG.dividendReinvestmentRatio)
    : 0;
}
export function lifeExpense(
  cost: number,
  policies: readonly PolicyId[] = [],
): number {
  return policies.includes('emergencyFund')
    ? Math.round(cost * (1 - PORTFOLIO_CONFIG.lifeExpenseReduction))
    : cost;
}
export function eligibleGrowth(
  s: Pick<PortfolioState, 'satellites' | 'longTermStrategies'> & {
    assetType: AssetId;
  },
): GrowthId[] {
  return [
    ...(s.satellites.length < PORTFOLIO_CONFIG.maxSatellites
      ? SATELLITE_ASSETS.filter(
          (id) => id !== s.assetType && !s.satellites.includes(id),
        )
      : []),
    ...(Object.keys(LONG_TERM_STRATEGIES) as PolicyId[]).filter(
      (id) => !s.longTermStrategies.includes(id),
    ),
  ];
}
function growthRandom(s: PortfolioState) {
  s.growthRng = (s.growthRng + 0x6d2b79f5) >>> 0;
  let t = s.growthRng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function drawGrowthChoices(
  s: PortfolioState & { assetType: AssetId },
): GrowthId[] {
  const pool = eligibleGrowth(s);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(growthRandom(s) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PORTFOLIO_CONFIG.offerCount);
}
export function acquireGrowth(
  s: PortfolioState & { assetType: AssetId; turn: number },
  id: GrowthId,
): boolean {
  if (!eligibleGrowth(s).includes(id)) return false;
  if (isSatellite(id)) s.satellites.push(id);
  else s.longTermStrategies.push(id);
  s.growthHistory.push({ turn: s.turn, choiceId: id });
  return true;
}
export function growthOption(id: GrowthId) {
  if (!isSatellite(id))
    return { ...LONG_TERM_STRATEGIES[id], kind: 'LONG TERM STRATEGY' };
  const text = {
    dividend: {
      summary: '毎年配当 / 値上がり控えめ',
      description:
        '投資資産の20%を高配当株へ。高配当株部分の年1.5%を現金で受け取り、生活上の出費に備えます。',
    },
    gold: {
      summary: '暴落・インフレ耐性 / 成長力低下',
      description:
        '投資資産の20%をゴールドへ。暴落とインフレに備える一方、平時の成長力は下がります。',
    },
    bonds: {
      summary: '大幅下落への備え / 成長力低下',
      description:
        '投資資産の20%を債券へ。大幅下落を和らげる一方、成長は控えめ。金利上昇・インフレには弱さがあります。',
    },
  }[id];
  return {
    name: `${ASSETS[id].name}を組み入れる`,
    icon: ASSETS[id].icon,
    color: ASSETS[id].color,
    kind: 'SATELLITE · 20%',
    ...text,
  };
}
