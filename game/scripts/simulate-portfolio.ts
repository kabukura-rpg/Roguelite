import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createGame,
  reducer,
  totalAssets,
  type State,
} from '../lib/game/engine.ts';
import {
  CORE_ASSETS,
  isPolicy,
  type CoreAssetId,
  type SatelliteId,
  type GrowthId,
} from '../lib/game/portfolio.ts';
import { publicMarketInfo } from '../lib/game/forecast.ts';
import { INCIDENTS } from '../lib/game/incidents.ts';
import type { CardId } from '../lib/game/cards.ts';
import { GAME_CONFIG, ASSETS } from '../lib/game/data.ts';

const seeds = 600;
const targets: { name: string; satellites: SatelliteId[] }[] = [
  { name: '長期方針優先', satellites: [] },
  { name: '高配当株優先', satellites: ['dividend'] },
  { name: 'ゴールド優先', satellites: ['gold'] },
  { name: '債券優先', satellites: ['bonds'] },
  { name: '高配当株＋ゴールド優先', satellites: ['dividend', 'gold'] },
  { name: '高配当株＋債券優先', satellites: ['dividend', 'bonds'] },
  { name: 'ゴールド＋債券優先', satellites: ['gold', 'bonds'] },
];
const policyPreference: GrowthId[] = [
  'contributions',
  'emergencyFund',
  'reinvestment',
  'cashManagement',
];
function chooseCard(s: State): string | null {
  // Read only the exact observations available to a player, never forecast.id,
  // eventId, weights, future returns, or a preview of settlement.
  const economy =
    publicMarketInfo(s).forecast?.signals.find(
      ([label]) => label === '景気',
    )?.[1] ?? '';
  const optimistic = economy.includes('上向き') || economy.includes('底打ち');
  const cautious = economy.includes('悪化');
  const preference: CardId[] = optimistic
    ? s.cash / totalAssets(s) >= 0.15
      ? ['dollarCost', 'leverage', 'contrarian', 'dividend']
      : ['leverage', 'dividend', 'dollarCost', 'contrarian']
    : cautious
      ? ['diversify', 'stopLoss', 'cashReserve', 'dividend']
      : ['dividend', 'diversify'];
  for (const id of preference) {
    const instance = s.deck.find(
      (c) => c.cardId === id && s.hand.includes(c.id),
    );
    if (instance) return instance.id;
  }
  return null;
}
function play(
  seed: number,
  core: CoreAssetId,
  target: SatelliteId[],
  cards: boolean,
): State {
  let s = reducer(reducer(createGame(), { type: 'START', seed }), {
    type: 'SELECT_ASSET',
    assetId: core,
  });
  let steps = 0;
  while (!['clear', 'gameOver'].includes(s.phase)) {
    if (++steps > 150) throw new Error(`stuck ${seed} ${s.phase}`);
    if (s.phase === 'forecast') {
      if (cards)
        s = reducer(s, { type: 'SELECT_CARD', instanceId: chooseCard(s) });
      s = reducer(s, { type: 'RESOLVE' });
    } else if (s.phase === 'turnResult') s = reducer(s, { type: 'NEXT' });
    else if (s.phase === 'incident') {
      const e = INCIDENTS.find((e) => e.id === s.currentIncident)!;
      s = reducer(s, {
        type: 'INCIDENT_CHOICE',
        choiceId:
          e.kind === 'shock'
            ? 'hold'
            : e.kind === 'life'
              ? 'pay'
              : e.choices!.find((c) => !c.cost)!.id,
      });
    } else if (s.phase === 'incidentResult')
      s = reducer(s, { type: 'INCIDENT_NEXT' });
    else if (s.phase === 'growth') {
      const choice =
        [...target, ...policyPreference].find((id) =>
          s.growthChoices.includes(id),
        ) ??
        s.growthChoices.find(isPolicy) ??
        s.growthChoices[0];
      s = reducer(s, { type: 'GROWTH', choiceId: choice });
    } else if (s.phase === 'broker') s = reducer(s, { type: 'LEAVE_SHOP' });
    else if (s.phase === 'reward') {
      const preference: CardId[] = [
        'leverage',
        'dollarCost',
        'diversify',
        'dividend',
        'stopLoss',
        'contrarian',
        'cashReserve',
      ];
      s = reducer(s, {
        type: 'REWARD',
        cardId: cards
          ? preference.find((id) => s.rewardChoices.includes(id))!
          : null,
      });
    }
  }
  return s;
}
const quantile = (xs: number[], q: number) =>
  [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)];
type Row = {
  core: string;
  preference: string;
  cards: boolean;
  n: number;
  p10: number;
  median: number;
  p90: number;
  goalRate: number;
  bankruptcyRate: number;
  medianDrawdown: number;
  targetExactRate: number;
  medianContributions: number;
  compositions: Record<string, number>;
};
const rows: Row[] = [];
const csv = [
  'seed,core,preference,cards,phase,total,max_drawdown,satellites,policies,contributions,goal',
];
for (const core of CORE_ASSETS)
  for (const target of targets)
    for (const cards of [false, true]) {
      const runs = [];
      for (let seed = 0; seed < seeds; seed++) {
        const s = play(seed, core, target.satellites, cards);
        const contribution = s.history.reduce(
          (sum, h) =>
            sum +
            (h.yearStartFunding?.contribution ?? 0) +
            (h.yearStartFunding?.cashTopUp ?? 0),
          0,
        );
        runs.push({
          total: totalAssets(s),
          dd: s.maxDrawdown,
          contribution,
          composition: [...s.satellites].sort().join('+') || 'none',
          goal: totalAssets(s) >= GAME_CONFIG.targetAssets,
          bankrupt: s.phase === 'gameOver',
        });
        csv.push(
          [
            seed,
            core,
            target.name,
            cards,
            s.phase,
            totalAssets(s),
            s.maxDrawdown,
            s.satellites.join('+'),
            s.longTermStrategies.join('+'),
            contribution,
            totalAssets(s) >= GAME_CONFIG.targetAssets,
          ].join(','),
        );
      }
      const compositions: Record<string, number> = {};
      for (const r of runs)
        compositions[r.composition] = (compositions[r.composition] ?? 0) + 1;
      rows.push({
        core,
        preference: target.name,
        cards,
        n: seeds,
        p10: quantile(
          runs.map((r) => r.total),
          0.1,
        ),
        median: quantile(
          runs.map((r) => r.total),
          0.5,
        ),
        p90: quantile(
          runs.map((r) => r.total),
          0.9,
        ),
        goalRate: runs.filter((r) => r.goal).length / seeds,
        bankruptcyRate: runs.filter((r) => r.bankrupt).length / seeds,
        medianDrawdown: quantile(
          runs.map((r) => r.dd),
          0.5,
        ),
        targetExactRate:
          (compositions[[...target.satellites].sort().join('+') || 'none'] ??
            0) / seeds,
        medianContributions: quantile(
          runs.map((r) => r.contribution),
          0.5,
        ),
        compositions,
      });
    }
const out = fileURLToPath(new URL('../docs/', import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(
  `${out}portfolio-simulation.json`,
  JSON.stringify(
    {
      seeds,
      runs: rows.length * seeds,
      coreAssets: CORE_ASSETS,
      returnTableChanged: false,
      rows,
    },
    null,
    2,
  ),
);
writeFileSync(`${out}portfolio-simulation.csv`, csv.join('\n') + '\n');
const yen = (n: number) => (n / 10000).toFixed(1) + '万';
const percent = (n: number) => (n * 100).toFixed(1) + '%';
const lines = [
  '# ポートフォリオ成長：シミュレーション結果',
  '',
  '600シード（0〜599）×3コア×7つの成長選択方針×カードあり／なし＝25,200プレイ。実際の3候補から選ぶ通常進行を使用し、リターン表・予報・カード・ランクは変更していません。',
  '',
  '## 比較条件',
  '',
  '- 「○○優先」は成長候補に希望のサテライトがあれば取得。なければ積立投資→生活防衛資金→配当再投資→現金管理の順に選びます。希望と異なる構成になることがあります。「構成一致率」は最終的に希望のサテライト構成となった割合です。',
  '- カードありは画面に公開される景気の観測材料だけで選択します。上向き／底打ちは、現金比率15%以上ならDCA優先、それ以外はレバレッジ優先。悪化時は分散投資→損切り→現金確保。不透明時は配当金→分散投資。手札に候補がなければ使用しません。',
  '- カードありは3年ごとの報酬を取得。カードなしは報酬をスキップ。ショップは両方とも利用せず退出し、購入費の差を作りません。戦略カードの購入／削除は別途テストで検証します。',
  '- 市場ショックは全構成でホールド、生活支出は支払い、日常は最初の無料選択肢。将来の相場・予報分類ID・確定リターンを参照しません。',
  '- 最大DDは既存の総資産ベース。積立／現金補充も含むため、投資リターン単独のDDではありません。外部からの追加資金は「積立等」で分けて表示します。',
  '- これは固定の操作方針による比較であり、全プレイヤー・全戦略の最適性を証明するものではありません。サテライト取得を強制していないため、同じ名前の方針でも最終構成は混在します。',
  '',
  '## 結果',
  '',
  '|コア|成長選択方針|カード|10%点|中央値|90%点|300万円到達|破産|最大DD中央値|構成一致率|積立等中央値|',
  '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const r of rows)
  lines.push(
    `|${ASSETS[r.core as CoreAssetId].name}|${r.preference}|${r.cards ? 'あり' : 'なし'}|${yen(r.p10)}|${yen(r.median)}|${yen(r.p90)}|${percent(r.goalRate)}|${percent(r.bankruptcyRate)}|${percent(r.medianDrawdown)}|${percent(r.targetExactRate)}|${yen(r.medianContributions)}|`,
  );
lines.push(
  '',
  '個別の25,200プレイは [CSV](portfolio-simulation.csv)、集計と実際のサテライト構成の件数は [JSON](portfolio-simulation.json) に保存しています。',
);
writeFileSync(`${out}portfolio-simulation.md`, lines.join('\n') + '\n');
process.stdout.write(
  JSON.stringify(
    {
      runs: rows.length * seeds,
      goalRange: [
        Math.min(...rows.map((r) => r.goalRate)),
        Math.max(...rows.map((r) => r.goalRate)),
      ],
      coreSummary: CORE_ASSETS.map((core) => ({
        core,
        without: rows
          .filter((r) => r.core === core && !r.cards)
          .map((r) => ({
            strategy: r.preference,
            median: r.median,
            goal: r.goalRate,
            dd: r.medianDrawdown,
          })),
        with: rows
          .filter((r) => r.core === core && r.cards)
          .map((r) => ({
            strategy: r.preference,
            median: r.median,
            goal: r.goalRate,
            dd: r.medianDrawdown,
          })),
      })),
    },
    null,
    2,
  ) + '\n',
);
