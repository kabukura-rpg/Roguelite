import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import * as currentEngine from '../lib/game/engine.ts';
import { INCIDENTS } from '../lib/game/incidents.ts';
import {
  CORE_ASSETS,
  lifeExpense,
  type GrowthId,
} from '../lib/game/portfolio.ts';
import { publicMarketInfo } from '../lib/game/forecast.ts';
import { GAME_CONFIG, ASSETS } from '../lib/game/data.ts';
import type { CardId } from '../lib/game/cards.ts';
import type { State } from '../lib/game/engine.ts';

const seeds = 600;
const styles = ['cash', 'standard', 'invest'] as const;
type Style = (typeof styles)[number];
const labels = { cash: '現金厚め', standard: '標準', invest: '追加投資優先' };
const engines = [{ name: 'after', engine: currentEngine, events: INCIDENTS }];
if (process.argv[2]) {
  const url = pathToFileURL(path.resolve(process.argv[2]) + '/');
  engines.unshift({
    name: 'before',
    engine: await import(new URL('engine.ts', url).href),
    events: (await import(new URL('incidents.ts', url).href)).INCIDENTS,
  });
}
function cardPreference(s: State, style: Style): CardId[] {
  const economy =
    publicMarketInfo(s).forecast?.signals.find(
      ([label]) => label === '景気',
    )?.[1] ?? '';
  const positive = economy.includes('上向き') || economy.includes('底打ち');
  if (style === 'cash')
    return s.cash / (s.cash + s.investedAssets) < 0.4
      ? ['cashReserve', 'dividend', 'diversify', 'stopLoss']
      : ['dividend', 'diversify', 'stopLoss'];
  if (style === 'invest')
    return ['dollarCost', 'contrarian', 'leverage', 'dividend', 'diversify'];
  if (positive)
    return s.cash / (s.cash + s.investedAssets) >= 0.25
      ? ['dollarCost', 'leverage', 'dividend', 'diversify']
      : ['leverage', 'dividend', 'diversify'];
  if (economy.includes('悪化'))
    return ['diversify', 'stopLoss', 'cashReserve', 'dividend'];
  return ['dividend', 'diversify', 'cashReserve'];
}
const growth: GrowthId[] = [
  'contributions',
  'emergencyFund',
  'dividend',
  'cashManagement',
  'gold',
  'reinvestment',
  'bonds',
];
const rewards: Record<Style, CardId[]> = {
  cash: [
    'cashReserve',
    'dividend',
    'diversify',
    'stopLoss',
    'leverage',
    'dollarCost',
    'contrarian',
  ],
  standard: [
    'leverage',
    'dollarCost',
    'diversify',
    'dividend',
    'stopLoss',
    'cashReserve',
    'contrarian',
  ],
  invest: [
    'dollarCost',
    'contrarian',
    'leverage',
    'dividend',
    'diversify',
    'stopLoss',
    'cashReserve',
  ],
};
const runs: {
  version: string;
  core: string;
  style: Style;
  seed: number;
  years: number;
  life: number;
  shortages: number;
  sales: number;
  sold: number;
  expenses: number;
  tax: number;
  total: number;
  goal: boolean;
  bankrupt: boolean;
  cashRatio: number;
}[] = [];
for (const { name, engine: e, events } of engines)
  for (const core of CORE_ASSETS)
    for (const style of styles)
      for (let seed = 0; seed < seeds; seed++) {
        let s = e.reducer(e.reducer(e.createGame(), { type: 'START', seed }), {
          type: 'SELECT_ASSET',
          assetId: core,
        });
        let steps = 0,
          life = 0,
          shortages = 0,
          sales = 0,
          sold = 0,
          expenses = 0,
          tax = 0,
          cashRatios = 0;
        while (!['clear', 'gameOver'].includes(s.phase)) {
          if (++steps > 160)
            throw new Error(`stuck ${name}/${seed}/${s.phase}`);
          if (s.phase === 'forecast') {
            cashRatios += s.cash / e.totalAssets(s);
            const id =
              cardPreference(s, style)
                .map(
                  (cardId) =>
                    s.deck.find(
                      (c) => c.cardId === cardId && s.hand.includes(c.id),
                    )?.id,
                )
                .find(Boolean) ?? null;
            s = e.reducer(s, { type: 'SELECT_CARD', instanceId: id });
            s = e.reducer(s, { type: 'RESOLVE' });
          } else if (s.phase === 'turnResult')
            s = e.reducer(s, { type: 'NEXT' });
          else if (s.phase === 'broker')
            s = e.reducer(s, { type: 'LEAVE_SHOP' });
          else if (s.phase === 'reward')
            s = e.reducer(s, {
              type: 'REWARD',
              cardId:
                rewards[style].find((id) => s.rewardChoices.includes(id)) ??
                null,
            });
          else if (s.phase === 'growth')
            s = e.reducer(s, {
              type: 'GROWTH',
              choiceId: growth.find((id) => s.growthChoices.includes(id))!,
            });
          else if (s.phase === 'incidentResult')
            s = e.reducer(s, { type: 'INCIDENT_NEXT' });
          else if (s.phase === 'incident') {
            const event = events.find((x) => x.id === s.currentIncident)!;
            if (event.kind === 'life') {
              life++;
              if (event.id === 'tax') tax++;
              const required = lifeExpense(
                s.currentExpense?.amount ?? event.cost!,
                s.longTermStrategies,
              );
              if (required > s.cash) shortages++;
            }
            s = e.reducer(s, {
              type: 'INCIDENT_CHOICE',
              choiceId:
                event.kind === 'life'
                  ? 'pay'
                  : event.kind === 'shock'
                    ? 'hold'
                    : event.choices!.find((c) => !c.cost)!.id,
            });
            if (event.kind === 'life') {
              const r = s.incidentHistory.at(-1)!;
              expenses += r.cost;
              sold += r.forcedSale;
              if (r.forcedSale > 0) sales++;
            }
          }
        }
        runs.push({
          version: name,
          core,
          style,
          seed,
          years: s.history.length,
          life,
          shortages,
          sales,
          sold,
          expenses,
          tax,
          total: e.totalAssets(s),
          goal: e.totalAssets(s) >= GAME_CONFIG.targetAssets,
          bankrupt: s.phase === 'gameOver',
          cashRatio: cashRatios / s.history.length,
        });
      }
const mean = (a: number[]) => a.reduce((n, x) => n + x, 0) / a.length;
const median = (a: number[]) =>
  [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * 0.5)];
const summaries = [];
for (const { name } of engines)
  for (const core of ['all', ...CORE_ASSETS])
    for (const style of styles) {
      const a = runs.filter(
        (r) =>
          r.version === name &&
          r.style === style &&
          (core === 'all' || r.core === core),
      );
      const life = a.reduce((n, r) => n + r.life, 0),
        year = a.reduce((n, r) => n + r.years, 0);
      summaries.push({
        version: name,
        core,
        style,
        n: a.length,
        expenseEncounterRate: mean(a.map((r) => Number(r.life > 0))),
        expensesPerRun: mean(a.map((r) => r.life)),
        expensePerPlayedYear: life / year,
        cashShortageExperienceRate: mean(a.map((r) => Number(r.shortages > 0))),
        shortagePerExpense: a.reduce((n, r) => n + r.shortages, 0) / life,
        forcedSaleExperienceRate: mean(a.map((r) => Number(r.sales > 0))),
        salePerExpense: a.reduce((n, r) => n + r.sales, 0) / life,
        salesPerRun: mean(a.map((r) => r.sales)),
        meanSold: mean(a.map((r) => r.sold)),
        meanExpense: mean(a.map((r) => r.expenses)),
        goalRate: mean(a.map((r) => Number(r.goal))),
        bankruptcyRate: mean(a.map((r) => Number(r.bankrupt))),
        medianTotal: median(a.map((r) => r.total)),
        taxExperienceRate: mean(a.map((r) => Number(r.tax > 0))),
        meanCashRatio: mean(a.map((r) => r.cashRatio)),
      });
    }
const dir = fileURLToPath(new URL('../docs/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(
  path.join(dir, 'expenses-simulation.json'),
  JSON.stringify(
    {
      seeds,
      runs: runs.length,
      baseline: process.argv[2] ? 'pre-change source snapshot' : null,
      summaries,
    },
    null,
    2,
  ),
);
writeFileSync(
  path.join(dir, 'expenses-simulation.csv'),
  [
    Object.keys(runs[0]).join(','),
    ...runs.map((r) => Object.values(r).join(',')),
  ].join('\n') + '\n',
);
const pct = (n: number) => (n * 100).toFixed(1) + '%';
const money = (n: number) => (n / 10000).toFixed(1) + '万';
const lines = [
  '# 生活イベント・現金不足：変更前後の比較',
  '',
  '600シード（0〜599）×3コア×3操作方針×変更前後＝10,800プレイ。各操作方針の合計は1,800プレイ。変更前後で同じシードと判断規則を使います。',
  '',
  '## 操作方針',
  '',
  '- 現金厚め：年初の現金比率40%未満なら現金確保を優先。ほかは配当金・守備カードを使い、追加投資カードは使いません。',
  '- 標準：公開された景気の観測材料が上向き／底打ちで現金25%以上ならDCA。現金が少なければレバレッジ・配当金を優先。悪化時は守備カード、不透明時は配当金などを優先。',
  '- 追加投資優先：DCA→逆張り→レバレッジを優先。手札にない場合は配当金・分散投資。',
  '- 報酬は各方針に合うカードを選びます。成長の優先順は全方針で同じ（積立投資→生活防衛資金→高配当株→現金管理→ゴールド→配当再投資→債券）。実際の3候補から取得します。',
  '- ショップは利用せず退出。市場ショックはホールド、日常は最初の無料選択肢。実際の相場結果や内部予報分類で判断しません。',
  '- 生活イベント数・費用・発生年は資産残高や生存期間により変わります。新しいイベントの追加で突発イベントの種類の抽選結果も変わるため、費用の増加だけの因果効果を示す比較ではありません。',
  '- 破産したプレイも除外しません。「年あたり」の分母は実際に到達した相場年数、他の経験率は全プレイが分母。現金不足は必要額>所持現金、強制売却は実売却額>0と定義します。',
  '',
  '## 3コア合計',
  '',
  '|版|方針|生活遭遇率|生活回数/プレイ|生活/到達年|現金不足経験率|強制売却経験率|売却回数/プレイ|売却総額平均|目標到達率|破産率|最終資産中央値|年初現金比率平均|',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const r of summaries.filter((r) => r.core === 'all'))
  lines.push(
    `|${r.version === 'before' ? '変更前' : '変更後'}|${labels[r.style]}|${pct(r.expenseEncounterRate)}|${r.expensesPerRun.toFixed(2)}|${pct(r.expensePerPlayedYear)}|${pct(r.cashShortageExperienceRate)}|${pct(r.forcedSaleExperienceRate)}|${r.salesPerRun.toFixed(2)}|${money(r.meanSold)}|${pct(r.goalRate)}|${pct(r.bankruptcyRate)}|${money(r.medianTotal)}|${pct(r.meanCashRatio)}|`,
  );
lines.push(
  '',
  '## コア別の目標到達率と強制売却',
  '',
  '|コア|方針|目標到達：前→後|強制売却経験：前→後|',
  '|---|---|---:|---:|',
);
for (const core of CORE_ASSETS)
  for (const style of styles) {
    const a = summaries.find(
        (r) => r.core === core && r.style === style && r.version === 'before',
      ),
      b = summaries.find(
        (r) => r.core === core && r.style === style && r.version === 'after',
      )!;
    lines.push(
      `|${ASSETS[core].name}|${labels[style]}|${a ? pct(a.goalRate) : '未測定'} → ${pct(b.goalRate)}|${a ? pct(a.forcedSaleExperienceRate) : '未測定'} → ${pct(b.forcedSaleExperienceRate)}|`,
    );
  }
lines.push(
  '',
  '各生活イベントあたりの不足率・売却率、税イベント遭遇率は [JSON](expenses-simulation.json)、全プレイの数値は [CSV](expenses-simulation.csv) を参照してください。目標に合わせた数値の再調整はしていません。',
);
writeFileSync(
  path.join(dir, 'expenses-simulation.md'),
  lines.join('\n') + '\n',
);
console.log(
  JSON.stringify(
    summaries.filter((r) => r.core === 'all'),
    null,
    2,
  ),
);
