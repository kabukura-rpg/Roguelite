import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, MARKET_EVENTS } from '../lib/game/data.ts';
import {
  CORE_ASSETS,
  PORTFOLIO_CONFIG as P,
  createPortfolio,
  portfolioAllocation,
  portfolioReturn,
  portfolioDividend,
  dividendReinvestment,
  lifeExpense,
  eligibleGrowth,
  acquireGrowth,
  drawGrowthChoices,
  isPolicy,
  type GrowthId,
} from '../lib/game/portfolio.ts';
import {
  createGame,
  reducer,
  applyDecision,
  applyDividend,
  applyYearStartFunding,
  totalAssets,
  type State,
} from '../lib/game/engine.ts';
import { publicMarketInfo } from '../lib/game/forecast.ts';
import { handleGrowth, handleIncident } from './helpers.ts';

function start(seed = 42): State {
  return reducer(reducer(createGame(), { type: 'START', seed }), {
    type: 'SELECT_ASSET',
    assetId: 'allWorld',
  });
}
function yearEnd(turn: number): State {
  const s = reducer(start(), { type: 'RESOLVE' });
  s.turn = turn;
  s.history[0] = { ...s.history[0], turn, year: turn };
  s.incidentCheckedTurn = turn;
  return s;
}
void test('new games allow exactly three immutable cores; legacy defensive saves retain their asset', () => {
  const selecting = reducer(createGame(), { type: 'START', seed: 42 });
  for (const assetId of CORE_ASSETS) {
    const s = reducer(selecting, { type: 'SELECT_ASSET', assetId });
    assert.equal(s.assetType, assetId);
    assert.equal(s.phase, 'forecast');
    assert.equal(reducer(s, { type: 'SELECT_ASSET', assetId: 'nasdaq' }), s);
  }
  for (const assetId of ['dividend', 'gold', 'bonds'] as const)
    assert.equal(
      reducer(selecting, { type: 'SELECT_ASSET', assetId }),
      selecting,
    );
  const legacy = { ...start(), assetType: 'gold' as const };
  assert.equal(reducer(legacy, { type: 'RESOLVE' }).assetType, 'gold');
});
void test('core 100% preserves every original asset return; fixed satellites give 80/20 and 60/20/20', () => {
  for (const core of CORE_ASSETS) {
    for (const event of MARKET_EVENTS)
      assert.equal(
        portfolioReturn(portfolioAllocation(core), event.returns),
        event.returns[core],
      );
  }
  assert.deepEqual(portfolioAllocation('allWorld', ['gold']), [
    { assetId: 'allWorld', weight: 0.8 },
    { assetId: 'gold', weight: 0.2 },
  ]);
  assert.deepEqual(portfolioAllocation('allWorld', ['gold', 'dividend']), [
    { assetId: 'allWorld', weight: 0.6 },
    { assetId: 'gold', weight: 0.2 },
    { assetId: 'dividend', weight: 0.2 },
  ]);
});
void test('weighted return is correct and neither consumes nor modifies cash', () => {
  const rates = {
    ...MARKET_EVENTS[0].returns,
    allWorld: -0.2,
    gold: 0.12,
    dividend: -0.12,
  };
  const mix = portfolioAllocation('allWorld', ['gold', 'dividend']);
  assert.ok(Math.abs(portfolioReturn(mix, rates) - -0.12) < 1e-12);
  const s = start();
  s.satellites = ['gold', 'dividend'];
  const snapshot = structuredClone(rates);
  applyDecision(s, 'hold', { ...MARKET_EVENTS[0], returns: rates });
  assert.equal(s.history[0].baseReturn, portfolioReturn(mix, rates));
  assert.equal(s.investedAssets, 704000);
  assert.equal(s.cash, 200000 + Math.round(704000 * 0.2 * 0.015));
  assert.deepEqual(rates, snapshot);
});
void test('third and duplicate satellites and repeated policies are rejected; acquired candidates disappear', () => {
  const s = start();
  assert.ok(acquireGrowth(s, 'gold'));
  assert.equal(acquireGrowth(s, 'gold'), false);
  assert.ok(acquireGrowth(s, 'dividend'));
  assert.equal(acquireGrowth(s, 'bonds'), false);
  assert.ok(acquireGrowth(s, 'emergencyFund'));
  assert.equal(acquireGrowth(s, 'emergencyFund'), false);
  assert.ok(eligibleGrowth(s).every(isPolicy));
  assert.ok(!eligibleGrowth(s).includes('emergencyFund'));
  assert.equal(s.assetType, 'allWorld');
  assert.ok(
    !eligibleGrowth({ ...s, assetType: 'gold', satellites: [] }).includes(
      'gold',
    ),
  );
});
void test('growth always offers 3 unique legal options across four acquisitions and isolates RNG', () => {
  for (let seed = 0; seed < 600; seed++) {
    const s = start(seed);
    const before = {
      rng: s.rng,
      cardRng: s.cardRng,
      incidentRng: s.incidentRng,
      forecastRng: s.forecastRng,
      marketRng: s.marketRng,
    };
    for (const turn of P.growthYears) {
      s.turn = turn;
      const offers = drawGrowthChoices(s);
      assert.equal(offers.length, 3);
      assert.equal(new Set(offers).size, 3);
      assert.ok(offers.every((id) => eligibleGrowth(s).includes(id)));
      assert.ok(acquireGrowth(s, offers[(seed + turn) % 3]));
    }
    assert.ok(s.satellites.length <= 2);
    assert.deepEqual(
      {
        rng: s.rng,
        cardRng: s.cardRng,
        incidentRng: s.incidentRng,
        forecastRng: s.forecastRng,
        marketRng: s.marketRng,
      },
      before,
    );
  }
});
void test('dividends apply only to high-dividend allocation and reinvestment uses half with conserved yen', () => {
  assert.equal(
    portfolioDividend(1_000_000, portfolioAllocation('sp500', ['dividend'])),
    3000,
  );
  assert.equal(portfolioDividend(1_000_000, portfolioAllocation('sp500')), 0);
  for (const amount of [0, 1, 3, 3000, 3001]) {
    const reinvested = dividendReinvestment(amount, true);
    assert.equal(reinvested + (amount - reinvested), amount);
    assert.equal(reinvested, Math.round(amount * 0.5));
    assert.equal(dividendReinvestment(amount, false), 0);
  }
  const s = start();
  s.investedAssets = 1_000_000;
  s.satellites = ['dividend'];
  assert.equal(applyDividend(s), 3000);
  assert.equal(s.investedAssets, 1_000_000);
  assert.equal(s.cash, 203000);
});
void test('reinvestment activates after acquiring dividend satellite; strategy-card payout is not reinvested', () => {
  const zero = Object.fromEntries(
    Object.keys(ASSETS).map((id) => [id, 0]),
  ) as (typeof MARKET_EVENTS)[number]['returns'];
  for (const satellite of [false, true]) {
    const s = start();
    s.longTermStrategies = ['reinvestment'];
    if (satellite) s.satellites = ['dividend'];
    s.dividendTurns = 1;
    applyDecision(s, 'hold', { ...MARKET_EVENTS[0], returns: zero });
    const h = s.history[0];
    assert.equal(h.dividend, satellite ? 2400 : 0);
    assert.equal(h.dividendReinvested, satellite ? 1200 : 0);
    assert.equal(h.strategyDividend, 8000);
    assert.equal(s.cash, 208000 + (satellite ? 1200 : 0));
    assert.equal(s.investedAssets, 800000 + (satellite ? 1200 : 0));
  }
});
void test('life defence reduces only life expense 10%, cash first then actual shortage, no added penalty', () => {
  assert.equal(lifeExpense(60000, []), 60000);
  assert.equal(lifeExpense(60000, ['emergencyFund']), 54000);
  const s: State = {
    ...start(),
    phase: 'incident',
    currentIncident: 'injury',
    cash: 10000,
    longTermStrategies: ['emergencyFund'],
  };
  const out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  assert.equal(out.incidentHistory[0].cost, 54000);
  assert.equal(out.incidentHistory[0].forcedSale, 44000);
  assert.equal(out.cash, 0);
  assert.equal(out.investedAssets, 756000);
});
void test('growth appears exactly after years 4/8/12/16 and after incidents, before overlapping card rewards', () => {
  for (const year of P.growthYears) {
    let s = yearEnd(year);
    s = { ...s, phase: 'incident', currentIncident: 'income' };
    s = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'cash' });
    assert.equal(s.phase, 'incidentResult');
    s = reducer(s, { type: 'INCIDENT_NEXT' });
    assert.equal(s.phase, 'growth');
    const before = structuredClone(s);
    assert.equal(reducer(s, { type: 'NEXT' }), s);
    assert.equal(
      reducer(s, { type: 'GROWTH', choiceId: 'bogus' as GrowthId }),
      s,
    );
    s = handleGrowth(s);
    assert.deepEqual(before.growthHistory, []);
    assert.equal(s.growthHistory.length, 1);
    assert.equal(
      s.phase,
      year === 12 ? 'reward' : s.phase === 'broker' ? 'broker' : 'forecast',
    );
    assert.equal(s.turn, year === 12 ? year : year + 1);
    assert.equal(
      reducer(s, { type: 'GROWTH', choiceId: before.growthChoices[0] }),
      s,
    );
  }
  assert.notEqual(reducer(yearEnd(3), { type: 'NEXT' }).phase, 'growth');
  assert.equal(reducer(yearEnd(20), { type: 'NEXT' }).phase, 'clear');
});
void test('annual contribution is +20000 net split equally, starts next year, and cannot duplicate on shop exit', () => {
  let s = reducer(yearEnd(4), { type: 'NEXT' });
  s.growthChoices = ['contributions', 'gold', 'bonds'];
  const total = totalAssets(s),
    cash = s.cash,
    invested = s.investedAssets;
  s = reducer(s, { type: 'GROWTH', choiceId: 'contributions' });
  assert.equal(s.turn, 5);
  assert.equal(totalAssets(s), total + P.annualContribution);
  assert.equal(s.cash, cash + 10000);
  assert.equal(s.investedAssets, invested + 10000);
  const before = structuredClone(s);
  applyYearStartFunding(s);
  assert.deepEqual(s, before);
  if (s.phase === 'broker') {
    const out = reducer(s, { type: 'LEAVE_SHOP' });
    assert.equal(totalAssets(out), totalAssets(s));
  }
});
void test('cash management uses post-incident cash ratio, strictly below 10%, pays once at next start', () => {
  for (const cash of [99999, 100000]) {
    let s = yearEnd(5);
    s.cash = cash;
    s.investedAssets = 1_000_000 - cash;
    s.longTermStrategies = ['cashManagement'];
    s = reducer(s, { type: 'NEXT' });
    assert.equal(s.cash, cash + (cash < 100000 ? 10000 : 0));
    assert.equal(s.yearStartFunding.cashTopUp, cash < 100000 ? 10000 : 0);
  }
  let s: State = {
    ...yearEnd(5),
    phase: 'incident',
    currentIncident: 'injury',
    investedAssets: 900000,
    cash: 110000,
    longTermStrategies: ['cashManagement'],
  };
  s = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  assert.equal(s.cash, 50000);
  s = reducer(s, { type: 'INCIDENT_NEXT' });
  assert.equal(s.cash, 60000);
});
void test('shock sensitivity is weighted, still one draw and the same three choice semantics', () => {
  const s: State = {
    ...start(),
    phase: 'incident',
    currentIncident: 'credit',
    satellites: ['gold', 'bonds'],
  };
  const solo = { ...s, satellites: [] };
  const one = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'hold' });
  const two = reducer(solo, { type: 'INCIDENT_CHOICE', choiceId: 'hold' });
  assert.equal(one.incidentRng, two.incidentRng);
  assert.ok(
    Math.abs(one.incidentHistory[0].rate!) <
      Math.abs(two.incidentHistory[0].rate!),
  );
  const sold = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'panic' });
  assert.equal(sold.cash, 920000);
  assert.equal(sold.panicReentryPending, true);
});
void test('new fields survive the existing JSON save format, preserve draft choices and avoid double funding', () => {
  const s = reducer(yearEnd(4), { type: 'NEXT' });
  const saved = JSON.parse(JSON.stringify({ v: 1, state: s }));
  const resumed = {
    ...createGame(saved.state.seed, saved.state.debug),
    ...saved.state,
  };
  assert.deepEqual(handleGrowth(resumed), handleGrowth(s));
  const old = start();
  const raw = { ...old } as Partial<State>;
  for (const field of Object.keys(createPortfolio(old.seed)))
    delete raw[field as keyof State];
  const legacy = { ...createGame(old.seed), ...raw };
  assert.deepEqual(legacy.satellites, []);
  assert.deepEqual(legacy.forecast, old.forecast);
  assert.equal(legacy.marketRng, old.marketRng);
  assert.equal(publicMarketInfo(legacy).market, undefined);
  assert.deepEqual(
    reducer(legacy, { type: 'RESOLVE' }).history[0].baseReturn,
    reducer(old, { type: 'RESOLVE' }).history[0].baseReturn,
  );
});
void test('growth choices cannot alter the already audited forecast/materials or upcoming market draw', () => {
  const s = reducer(yearEnd(4), { type: 'NEXT' });
  const a = handleGrowth(s);
  const b = reducer(s, { type: 'GROWTH', choiceId: s.growthChoices.at(-1)! });
  assert.equal(a.marketRng, b.marketRng);
  assert.equal(a.forecastRng, b.forecastRng);
  assert.equal(a.cardRng, b.cardRng);
  assert.equal(a.incidentRng, b.incidentRng);
  const readyA = a.phase === 'broker' ? reducer(a, { type: 'LEAVE_SHOP' }) : a;
  const readyB = b.phase === 'broker' ? reducer(b, { type: 'LEAVE_SHOP' }) : b;
  assert.deepEqual(
    publicMarketInfo(readyA).forecast,
    publicMarketInfo(readyB).forecast,
  );
  assert.equal(publicMarketInfo(readyA).market, undefined);
  assert.equal(
    reducer(readyA, { type: 'RESOLVE' }).eventId,
    reducer(readyB, { type: 'RESOLVE' }).eventId,
  );
});
void test('a full run records all four growth choices with no duplicate assets or policies', () => {
  let s = start(12345),
    guard = 0;
  while (!['clear', 'gameOver'].includes(s.phase)) {
    assert.ok(++guard < 120);
    if (s.phase === 'forecast') s = reducer(s, { type: 'RESOLVE' });
    else if (s.phase === 'turnResult') s = reducer(s, { type: 'NEXT' });
    else if (s.phase === 'incident' || s.phase === 'incidentResult')
      s = handleIncident(s);
    else if (s.phase === 'growth') s = handleGrowth(s);
    else if (s.phase === 'broker') s = reducer(s, { type: 'LEAVE_SHOP' });
    else if (s.phase === 'reward')
      s = reducer(s, { type: 'REWARD', cardId: null });
  }
  assert.equal(s.phase, 'clear');
  assert.deepEqual(
    s.growthHistory.map((h) => h.turn),
    P.growthYears,
  );
  assert.equal(new Set(s.growthHistory.map((h) => h.choiceId)).size, 4);
  assert.ok(s.satellites.length <= 2);
});
