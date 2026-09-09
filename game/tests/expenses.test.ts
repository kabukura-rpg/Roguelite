import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPENSE_CONFIG as E,
  expenseRange,
  expenseAssetFactor,
  quoteExpense,
  expensePayment,
  currentExpenseQuote,
  createExpenses,
  expenseRandom,
} from '../lib/game/expenses.ts';
import {
  createGame,
  reducer,
  totalAssets,
  applyDividend,
  type State,
} from '../lib/game/engine.ts';
import {
  portfolioAllocation,
  portfolioReturn,
  portfolioDividend,
} from '../lib/game/portfolio.ts';
import { INCIDENTS } from '../lib/game/incidents.ts';
import { MARKET_EVENTS } from '../lib/game/data.ts';
import { publicMarketInfo } from '../lib/game/forecast.ts';

function bill(cash = 80000, invested = 1520000): State {
  return {
    ...createGame(42),
    phase: 'incident',
    currentIncident: 'appliance',
    turn: 10,
    cash,
    investedAssets: invested,
    satellites: ['dividend', 'gold'],
    currentExpense: {
      eventId: 'appliance',
      turn: 10,
      model: 'year',
      baseAmount: 180000,
      assetFactor: 1,
      amount: 180000,
    },
  };
}
void test('expense base draws obey all four year ranges including year boundaries', () => {
  for (let turn = 1; turn <= 20; turn++) {
    const range = E.ranges[Math.floor((turn - 1) / 5)];
    assert.deepEqual(expenseRange(turn), range);
    assert.equal(quoteExpense('repair', turn, 1000000, 0).baseAmount, range[0]);
    assert.equal(quoteExpense('repair', turn, 1000000, 1).baseAmount, range[1]);
    for (let i = 0; i < 600; i++) {
      const s = createExpenses(i),
        q = quoteExpense('repair', turn, 1000000, expenseRandom(s));
      assert.ok(q.baseAmount >= range[0] && q.baseAmount <= range[1]);
      assert.equal(q.amount, q.baseAmount);
    }
  }
});
void test('total-asset correction is capped at ±20%; cash split cannot change a quote', () => {
  for (const total of [
    0, 1, 1000, 100000, 500000, 1000000, 2000000, 4000000, 100000000,
  ]) {
    assert.ok(
      expenseAssetFactor(total) >= 0.8 && expenseAssetFactor(total) <= 1.2,
    );
    const a = bill(0, total),
      b = bill(total, 0);
    assert.deepEqual(
      quoteExpense('pet', 12, totalAssets(a), 0.3),
      quoteExpense('pet', 12, totalAssets(b), 0.3),
    );
  }
  assert.equal(expenseAssetFactor(250000), 0.8);
  assert.equal(expenseAssetFactor(4000000), 1.2);
});
void test('rare tax is 8% with 80000 floor and 300000 cap before life defence', () => {
  assert.equal(quoteExpense('tax', 20, 100, 0).amount, 80000);
  assert.equal(quoteExpense('tax', 1, 2000000, 1).amount, 160000);
  assert.equal(quoteExpense('tax', 15, 10000000, 0).amount, 300000);
  assert.ok(INCIDENTS.find((e) => e.id === 'tax')!.weight! < 1);
  assert.equal(
    expensePayment(300000, 0, quoteExpense('tax', 1, 10000000, 0), [
      'emergencyFund',
    ]).required,
    270000,
  );
});
void test('mandatory expense applies defence once and rejects skip or other commands', () => {
  const s = bill();
  s.longTermStrategies = ['emergencyFund'];
  for (const choiceId of ['skip', 'decline', 'hold'])
    assert.equal(reducer(s, { type: 'INCIDENT_CHOICE', choiceId }), s);
  assert.equal(reducer(s, { type: 'NEXT' }), s);
  const out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  assert.equal(out.incidentHistory[0].cost, 162000);
  assert.equal(out.incidentHistory[0].forcedSale, 82000);
  assert.equal(out.investedAssets, 1438000);
});
void test('enough cash covers all expense without selling or changing portfolio investment', () => {
  const s = bill(250000, 1520000),
    out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  assert.equal(out.cash, 70000);
  assert.equal(out.investedAssets, 1520000);
  assert.equal(out.incidentHistory[0].forcedSale, 0);
  assert.deepEqual(out.incidentHistory[0].soldAllocation, []);
});
void test('only the cash shortfall is sold; total assets and integer yen reconcile', () => {
  for (const cash of [0, 1, 80000, 179999, 180000, 250000]) {
    const s = bill(cash),
      before = structuredClone(s);
    const preview = expensePayment(s.cash, s.investedAssets, s.currentExpense!);
    const out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
    assert.deepEqual(s, before);
    assert.equal(out.cash, preview.cashAfter);
    assert.equal(out.investedAssets, preview.investedAfter);
    assert.equal(out.incidentHistory[0].forcedSale, Math.max(0, 180000 - cash));
    assert.equal(totalAssets(out), totalAssets(s) - 180000);
    assert.equal(
      reducer(out, { type: 'INCIDENT_CHOICE', choiceId: 'pay' }),
      out,
    );
  }
});
void test('insolvency sells only available assets, records unpaid amount and ends after result', () => {
  const s = bill(80000, 50000),
    out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  assert.equal(out.incidentHistory[0].requiredCost, 180000);
  assert.equal(out.incidentHistory[0].cost, 130000);
  assert.equal(out.incidentHistory[0].forcedSale, 50000);
  assert.equal(totalAssets(out), 0);
  assert.equal(out.phase, 'incidentResult');
  assert.equal(reducer(out, { type: 'INCIDENT_NEXT' }).phase, 'gameOver');
});
void test('proportional liquidation preserves CORE/SATELLITE weights and reduces future investment earnings', () => {
  const s = bill(),
    out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  const allocation = portfolioAllocation(out.assetType, out.satellites);
  assert.deepEqual(allocation, portfolioAllocation(s.assetType, s.satellites));
  assert.deepEqual(
    allocation.map((p) => p.weight),
    [0.6, 0.2, 0.2],
  );
  assert.deepEqual(out.incidentHistory[0].soldAllocation, allocation);
  const rate = portfolioReturn(
    allocation,
    MARKET_EVENTS.find((e) => e.id === 'normal_up')!.returns,
  );
  assert.ok(out.investedAssets * rate < s.investedAssets * rate);
  assert.deepEqual(out.growthHistory, s.growthHistory);
});
void test('high-dividend allocation payout shrinks after a forced sale with no asset performance change', () => {
  const s = bill(),
    out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  assert.equal(
    portfolioDividend(
      s.investedAssets,
      portfolioAllocation(s.assetType, s.satellites),
    ),
    4560,
  );
  assert.equal(applyDividend(out), 4260); // 1,420,000 × 20% × 1.5%
  assert.equal(out.cash, 4260);
});
void test('expense is frozen on encounter using its own RNG, never rerolled by reading or saving', () => {
  let found: State | undefined;
  for (let seed = 0; seed < 100; seed++) {
    let s = reducer(reducer(createGame(), { type: 'START', seed }), {
      type: 'SELECT_ASSET',
      assetId: 'allWorld',
    });
    s = reducer(s, { type: 'RESOLVE' });
    const out = reducer(s, { type: 'NEXT' });
    if (out.currentExpense) {
      assert.equal(out.marketRng, s.marketRng);
      assert.equal(out.forecastRng, s.forecastRng);
      assert.equal(out.cardRng, s.cardRng);
      assert.equal(out.growthRng, s.growthRng);
      found = out;
      break;
    }
  }
  assert.ok(found);
  const s = found!;
  const before = structuredClone(s),
    event = INCIDENTS.find((e) => e.id === s.currentIncident)!;
  for (let i = 0; i < 5; i++) currentExpenseQuote(s, event);
  assert.deepEqual(s, before);
  assert.equal(s.currentExpense!.model, 'year');
  const saved = JSON.parse(JSON.stringify({ v: 1, state: s }));
  const resumed = { ...createGame(saved.state.seed), ...saved.state };
  assert.deepEqual(
    reducer(resumed, { type: 'INCIDENT_CHOICE', choiceId: 'pay' }),
    reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' }),
  );
  assert.equal(
    publicMarketInfo(reducer(createGame(), { type: 'START', seed: 2 })).market,
    undefined,
  );
});
void test('old saves keep an already displayed fixed invoice and adopt new costs only on later encounters', () => {
  const s = bill();
  s.currentExpense = null;
  const event = INCIDENTS.find((e) => e.id === 'appliance')!;
  assert.equal(currentExpenseQuote(s, event).amount, 90000);
  assert.equal(
    reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' }).incidentHistory[0]
      .cost,
    90000,
  );
  const paid = reducer(bill(), { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  const resumed = { ...createGame(), ...JSON.parse(JSON.stringify(paid)) };
  assert.deepEqual(resumed.incidentHistory, paid.incidentHistory);
  assert.equal(
    reducer(resumed, { type: 'INCIDENT_CHOICE', choiceId: 'pay' }),
    resumed,
  );
  assert.equal(
    reducer(resumed, { type: 'INCIDENT_NEXT' }).currentExpense,
    null,
  );
});
