import { handleIncident } from './helpers.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKET_EVENTS,
  ASSETS,
  type Decision,
  type AssetId,
} from '../lib/game/data.ts';
import {
  createGame,
  reducer,
  applyDecision,
  applyDividend,
  applyPanicReentry,
  shouldShowBroker,
  updateDrawdown,
  changeAsset,
  totalAssets,
  calculateRank,
  calculateTitles,
  getAdjustedEventWeights,
  type State,
} from '../lib/game/engine.ts';
const event = (id: string) => MARKET_EVENTS.find((e) => e.id === id)!;
const crash = (decision: Decision) => {
  const s = createGame();
  applyDecision(s, decision, event('crash'));
  return s;
};
void test('TC01: initial 80/20 allocation and five selectable assets', () => {
  for (const id of Object.keys(ASSETS) as AssetId[]) {
    let s = reducer(createGame(), { type: 'START', seed: 1 });
    assert.equal(s.phase, 'select');
    assert.equal(s.investedAssets, 800000);
    assert.equal(s.cash, 200000);
    s = reducer(s, { type: 'SELECT_ASSET', assetId: id });
    assert.equal(s.assetType, id);
    assert.equal(s.phase, 'forecast');
  }
});
void test('TC02 hold through crash', () => {
  const s = crash('hold');
  assert.equal(s.investedAssets, 560000);
  assert.equal(s.cash, 200000);
  assert.equal(totalAssets(s), 760000);
});
void test('TC03 buy before return', () => {
  const s = crash('buyMore');
  assert.equal(s.investedAssets, 630000);
  assert.equal(s.cash, 100000);
  assert.equal(totalAssets(s), 730000);
});
void test('TC04 panic after return', () => {
  const s = crash('panic');
  assert.equal(s.investedAssets, 56000);
  assert.equal(s.cash, 704000);
  assert.equal(totalAssets(s), 760000);
  assert.equal(s.panicReentryPending, true);
});
void test('TC05 reentry exactly once, cash conserved', () => {
  const s = crash('panic');
  applyPanicReentry(s);
  assert.equal(s.investedAssets, 267200);
  assert.equal(s.cash, 492800);
  applyPanicReentry(s);
  assert.equal(s.investedAssets, 267200);
  assert.equal(s.cash, 492800);
});
void test('TC06 dividend uses remaining year-end investment', () => {
  const s = createGame();
  s.assetType = 'dividend';
  s.investedAssets = 1000000;
  assert.equal(applyDividend(s), 15000);
  assert.equal(s.cash, 215000);
  const p = createGame();
  p.assetType = 'dividend';
  applyDecision(p, 'panic', event('crash'));
  assert.equal(p.history[0].dividend, 936);
  assert.equal(p.investedAssets, 62400);
  assert.equal(p.cash, 762536);
});
void test('TC07 broker limits and guaranteed appearance', () => {
  assert.equal(shouldShowBroker(2, 5, 0), false);
  assert.equal(shouldShowBroker(8, 2, 0), false);
  assert.equal(shouldShowBroker(5, 5, 0.9999), true);
  assert.equal(shouldShowBroker(3, 3, 0.29), true);
  assert.equal(shouldShowBroker(3, 3, 0.3), false);
  assert.equal(shouldShowBroker(4, 4, 0.59), true);
});
void test('TC08 peak and maximum drawdown', () => {
  const s = createGame();
  s.cash = 0;
  s.investedAssets = 1200000;
  updateDrawdown(s);
  s.investedAssets = 900000;
  updateDrawdown(s);
  assert.equal(s.maxDrawdown, -0.25);
  s.investedAssets = 1300000;
  updateDrawdown(s);
  assert.equal(s.maxDrawdown, -0.25);
});
function play(
  seed: number,
  assetId: AssetId = 'sp500',
  decision: Decision = 'hold',
) {
  let s = reducer(createGame(), { type: 'START', seed });
  s = reducer(s, { type: 'SELECT_ASSET', assetId });
  let guard = 0;
  while (!['clear', 'gameOver'].includes(s.phase)) {
    assert.ok(++guard < 100);
    if (s.phase === 'broker') s = reducer(s, { type: 'BROKER', assetId });
    else if (s.phase === 'forecast') s = reducer(s, { type: 'RESOLVE' });
    else if (s.phase === 'incident' || s.phase === 'incidentResult')
      s = handleIncident(s, decision);
    else if (s.phase === 'turnResult') s = reducer(s, { type: 'NEXT' });
    else if (s.phase === 'reward')
      s = reducer(s, { type: 'REWARD', cardId: null });
  }
  return s;
}
void test('TC09: 20 turns, history, counters, all assets, deterministic replay', () => {
  for (const id of Object.keys(ASSETS) as AssetId[]) {
    for (const d of ['hold', 'panic', 'buyMore'] as Decision[]) {
      const s = play(12345, id, d);
      assert.equal(s.phase, 'clear');
      assert.equal(s.history.length, 20);
      assert.ok(s.history.every((h) => h.decision === 'hold'));
      assert.equal(s.assetUsageTurns[id], 20);
      assert.deepEqual(s, play(12345, id, d));
      assert.ok(
        s.history.every(
          (h) =>
            Number.isInteger(h.totalAfter) &&
            h.cashAfter >= 0 &&
            h.investedAfter >= 0,
        ),
      );
    }
  }
});
void test('TC10 zero assets ends the game and rounds to zero', () => {
  const s = createGame();
  s.cash = 0;
  s.investedAssets = 1;
  applyDecision(s, 'hold', {
    ...event('crash'),
    returns: { sp500: -2, nasdaq: -2, dividend: -2, gold: -2, bonds: -2 },
  });
  assert.equal(s.phase, 'gameOver');
  assert.equal(totalAssets(s), 0);
  assert.equal(s.maxDrawdown, -1);
  assert.equal(calculateRank(0), 'F');
  assert.ok(calculateTitles(s).includes('退場芸人'));
});
void test('broker fee cash first, investment fallback, minimum, no-change free', () => {
  const s = createGame();
  changeAsset(s, 'gold');
  assert.equal(s.cash, 190000);
  assert.equal(s.investedAssets, 800000);
  assert.equal(s.brokerFee, 10000);
  const t = createGame();
  t.cash = 2000;
  changeAsset(t, 'bonds');
  assert.equal(t.cash, 0);
  assert.equal(t.investedAssets, 793980);
  const u = createGame();
  u.investedAssets = 90000;
  u.cash = 10000;
  changeAsset(u, 'gold');
  assert.equal(totalAssets(u), 95000);
  const v = createGame();
  changeAsset(v, 'sp500');
  assert.equal(totalAssets(v), 1000000);
  assert.equal(v.brokerFee, 0);
});
void test('unaffordable fee clamps balances and causes game over', () => {
  const s = createGame();
  s.cash = 10;
  s.investedAssets = 100;
  changeAsset(s, 'gold');
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.cash, 0);
  assert.equal(s.investedAssets, 0);
});
void test('market transition weights match specified multipliers', () => {
  const weights = getAdjustedEventWeights([{ marketEvent: 'crash' }]);
  assert.equal(weights.find((w) => w.id === 'recovery')!.weight, 25);
  assert.equal(weights.find((w) => w.id === 'bubble')!.weight, 2.1);
  assert.equal(weights.find((w) => w.id === 'crash')!.weight, 3.5);
  assert.equal(
    getAdjustedEventWeights([
      { marketEvent: 'bubble' },
      { marketEvent: 'bubble' },
    ]).find((w) => w.id === 'bubble')!.weight,
    0,
  );
});
void test('200 runs: every event appears, no triples, broker gaps 3–5, first visit 3–5', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const s = play(seed);
    for (let i = 0; i < s.history.length; i++) {
      seen.add(s.history[i].marketEvent);
      if (i >= 2)
        assert.ok(
          !(
            s.history[i].marketEvent === s.history[i - 1].marketEvent &&
            s.history[i].marketEvent === s.history[i - 2].marketEvent
          ),
        );
    }
    const visits = [0, ...s.brokerVisits];
    for (let i = 1; i < visits.length; i++)
      assert.ok(
        visits[i] - visits[i - 1] >= 3 && visits[i] - visits[i - 1] <= 5,
      );
    assert.ok(s.turn - visits.at(-1)! <= 5);
    if (s.phase === 'clear') assert.ok(20 - visits.at(-1)! < 5);
  }
  assert.equal(seen.size, 10);
});
void test('same seed has same markets across decisions and assets', () => {
  const series = (s: State) => s.history.map((h) => h.marketEvent);
  assert.deepEqual(
    series(play(345, 'sp500', 'hold')),
    series(play(345, 'gold', 'panic')),
  );
});
void test('phase guards stop double settlement, duplicate next and invalid initial asset', () => {
  let s = reducer(createGame(), { type: 'START', seed: 42 });
  const original = s;
  s = reducer(s, { type: 'SELECT_ASSET', assetId: 'invalid' as AssetId });
  assert.equal(s, original);
  s = reducer(s, { type: 'SELECT_ASSET', assetId: 'sp500' });
  s = reducer(s, { type: 'RESOLVE' });
  assert.equal(reducer(s, { type: 'RESOLVE' }), s);
  s = reducer(s, { type: 'NEXT' });
  assert.equal(reducer(s, { type: 'NEXT' }), s);
  assert.ok(s.turn === 2 || s.phase === 'incident');
});
void test('rank thresholds and restart reset complete state', () => {
  for (const [value, rank] of [
    [0, 'F'],
    [1, 'D'],
    [999999, 'D'],
    [1000000, 'C'],
    [1300000, 'B'],
    [1800000, 'A'],
    [2500000, 'S'],
    [3500000, 'SS'],
  ] as const)
    assert.equal(calculateRank(value), rank);
  const s = reducer(play(1), { type: 'START', seed: 2 });
  assert.equal(s.phase, 'select');
  assert.equal(s.history.length, 0);
  assert.equal(totalAssets(s), 1000000);
  assert.equal(s.maxDrawdown, 0);
});
void test('titles require clear when specified and cap at 3', () => {
  const s = play(1, 'gold', 'hold');
  assert.ok(calculateTitles(s).includes('鋼の握力'));
  assert.ok(calculateTitles(s).includes('金ピカ投資家'));
  const p = createGame();
  p.decisionCounts.panic = 5;
  assert.ok(calculateTitles(p).includes('狼狽王'));
  s.investedAssets = 4000000;
  s.cash = 0;
  s.maxDrawdown = 0;
  assert.equal(calculateTitles(s).length, 3);
});
void test('debug forcing is restricted to debug forecast', () => {
  let s = reducer(createGame(), { type: 'START', seed: 1, debug: false });
  s = reducer(s, { type: 'SELECT_ASSET', assetId: 'sp500' });
  assert.equal(reducer(s, { type: 'FORCE_EVENT', eventId: 'crash' }), s);
  s = { ...s, debug: true };
  assert.equal(
    reducer(s, { type: 'FORCE_EVENT', eventId: 'crash' }).forcedEventId,
    'crash',
  );
});
void test('odd yen transfers conserve total before market and never go negative', () => {
  const s = createGame();
  s.investedAssets = 3;
  s.cash = 1;
  s.assetType = 'gold';
  applyDecision(s, 'buyMore', event('strong_up'));
  assert.equal(totalAssets(s), 4);
  assert.equal(s.cash, 0);
  assert.equal(s.investedAssets, 4);
  const p = createGame();
  p.cash = 1;
  p.investedAssets = 5;
  p.assetType = 'gold';
  applyDecision(p, 'panic', event('strong_up'));
  assert.equal(totalAssets(p), 6);
});
