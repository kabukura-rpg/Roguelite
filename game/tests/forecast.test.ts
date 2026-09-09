import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORECAST_CONFIG,
  FORECAST_PATTERNS,
  generateForecast,
  selectActualMarketEvent,
  calculateMarketReturn,
  compareForecast,
  publicMarketInfo,
  type ForecastId,
} from '../lib/game/forecast.ts';
import {
  createGame,
  reducer,
  adjustedReturn,
  totalAssets,
  type State,
  type Action,
} from '../lib/game/engine.ts';
import { MARKET_EVENTS } from '../lib/game/data.ts';
import { CARD_CONFIG } from '../lib/game/cards.ts';

function start(seed = 123) {
  return reducer(reducer(createGame(), { type: 'START', seed }), {
    type: 'SELECT_ASSET',
    assetId: 'nasdaq',
  });
}
void test('forecast exists before any market draw; selecting, deselecting, or reading never draws a result', () => {
  const s = start();
  assert.equal(s.phase, 'forecast');
  assert.equal(s.eventId, null);
  assert.equal(s.marketRng, createGame(123).marketRng);
  assert.ok(s.forecast);
  const before = structuredClone(s);
  let chosen = s;
  for (const id of [...s.hand, null]) {
    chosen = reducer(chosen, { type: 'SELECT_CARD', instanceId: id });
    assert.equal(chosen.marketRng, s.marketRng);
    assert.deepEqual(chosen.forecast, s.forecast);
    assert.equal(chosen.eventId, null);
    const visible = publicMarketInfo(chosen);
    assert.equal(visible.market, undefined);
    assert.equal(visible.marketResult, undefined);
    assert.ok(
      visible.forecast?.signals.every(([label]) => !label.includes('リスク')),
    );
  }
  assert.deepEqual(s, before);
  for (const action of [
    { type: 'REVEAL' },
    { type: 'DECIDE', decision: 'hold' },
  ]) {
    assert.equal(
      reducer(s, action as Action),
      s,
      'retired actions cannot reveal an outcome',
    );
  }
});
void test('resolve draws once, locks strategy, records original forecast and reveals actual return', () => {
  let s = start();
  s = reducer(s, { type: 'SELECT_CARD', instanceId: s.hand[0] });
  const before = structuredClone(s);
  const out = reducer(s, { type: 'RESOLVE' });
  assert.deepEqual(s, before);
  assert.equal(out.phase, 'turnResult');
  assert.ok(out.eventId);
  assert.notEqual(out.marketRng, s.marketRng);
  assert.deepEqual(out.history[0].forecast, s.forecast);
  assert.ok(publicMarketInfo(out).marketResult);
  assert.equal(publicMarketInfo(out).forecast, undefined);
  assert.equal(reducer(out, { type: 'RESOLVE' }), out);
  assert.equal(reducer(out, { type: 'SELECT_CARD', instanceId: null }), out);
  assert.equal(
    reducer(out, { type: 'REBALANCE_TARGET', assetId: 'gold' }),
    out,
  );
});
void test('same observations produce multiple outcomes, including contrary outcomes, at configured accuracy', () => {
  for (const id of Object.keys(FORECAST_PATTERNS) as ForecastId[]) {
    for (const history of [
      [],
      [{ marketEvent: 'crash' }, { marketEvent: 'crash' }],
      [{ marketEvent: 'normal_up' }, { marketEvent: 'normal_up' }],
    ]) {
      const forecast = {
        id,
        accuracy: FORECAST_CONFIG.directionAccuracy,
        enhanced: false,
      };
      const seen = new Set<string>();
      let matched = 0;
      for (let i = 0; i < 10000; i++) {
        const result = selectActualMarketEvent(
          forecast,
          (i + 0.5) / 10000,
          history,
        );
        seen.add(result);
        if (compareForecast(forecast, result).matched) matched++;
        if (history.length) assert.notEqual(result, history[0].marketEvent);
      }
      assert.ok(seen.size >= 3);
      assert.equal(matched / 10000, FORECAST_CONFIG.directionAccuracy);
      if (id !== 'uncertain') {
        const desired = id === 'bearish' ? -1 : 1;
        const expected = FORECAST_PATTERNS[id].expected;
        assert.ok(
          expected.every(
            (event) =>
              Math.sign(
                MARKET_EVENTS.find((e) => e.id === event)!.returns.sp500,
              ) === desired,
          ),
        );
      }
    }
  }
});
void test('information reward improves probability, does not expose an event, and expires after one market', () => {
  let s = start();
  s = { ...s, phase: 'incident', currentIncident: 'seminar' };
  s = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'join' });
  s = reducer(s, { type: 'INCIDENT_NEXT' });
  assert.equal(s.phase, 'forecast');
  assert.equal(
    s.forecast?.accuracy,
    FORECAST_CONFIG.directionAccuracy + FORECAST_CONFIG.insightBonus,
  );
  assert.equal(s.forecast?.enhanced, true);
  assert.equal(s.eventId, null);
  assert.equal(publicMarketInfo(s).marketResult, undefined);
  const out = reducer(s, { type: 'RESOLVE' });
  assert.equal(out.forecastInsight, false);
  assert.equal(out.history.at(-1)?.forecast?.enhanced, true);
  const next = reducer(
    { ...out, incidentCheckedTurn: out.turn },
    { type: 'NEXT' },
  );
  assert.equal(next.forecast?.enhanced, false);
  assert.equal(next.forecast?.accuracy, FORECAST_CONFIG.directionAccuracy);
  assert.equal(
    generateForecast(0, [], 9).accuracy,
    FORECAST_CONFIG.maxAccuracy,
  );
});
void test('forecast generation and actual draws have separate seeded streams; card choices do not change outcomes', () => {
  const s = start(456);
  const without = reducer(s, { type: 'RESOLVE' });
  const withCard = reducer(
    reducer(s, { type: 'SELECT_CARD', instanceId: s.hand[0] }),
    { type: 'RESOLVE' },
  );
  assert.equal(without.eventId, withCard.eventId);
  assert.equal(without.history[0].baseReturn, withCard.history[0].baseReturn);
  assert.deepEqual(without.forecast, withCard.forecast);
  assert.deepEqual(without, reducer(start(456), { type: 'RESOLVE' }));
  assert.equal(without.rng, s.rng);
  assert.equal(without.incidentRng, s.incidentRng);
});
void test('return draw varies within bounded asset-specific rates, without mutating the source table', () => {
  const source = structuredClone(MARKET_EVENTS);
  for (const event of MARKET_EVENTS) {
    const low = calculateMarketReturn(event, 0);
    const high = calculateMarketReturn(event, 0.999999);
    for (const [asset, base] of Object.entries(event.returns)) {
      const a = low[asset as keyof typeof low],
        b = high[asset as keyof typeof high];
      assert.equal(Math.sign(a), Math.sign(base));
      assert.equal(Math.sign(b), Math.sign(base));
      if (base) assert.notEqual(a, b);
      assert.ok(Math.abs(a) <= Math.abs(base) * 1.2 + 0.0005);
      assert.ok(Math.abs(b) <= Math.abs(base) * 1.2 + 0.0005);
    }
  }
  assert.deepEqual(MARKET_EVENTS, source);
});
void test('stop loss caps BOTH directions, including a pending bonus; leverage doubles gains and losses', () => {
  assert.equal(
    adjustedReturn(-0.58, 'stopLoss', false),
    CARD_CONFIG.stopLossFloor,
  );
  assert.equal(
    adjustedReturn(0.22, 'stopLoss', false),
    CARD_CONFIG.stopLossCeiling,
  );
  assert.equal(
    adjustedReturn(0.05, 'stopLoss', true),
    CARD_CONFIG.stopLossCeiling,
  );
  assert.equal(adjustedReturn(-0.1, 'stopLoss', false), -0.1);
  assert.equal(adjustedReturn(0.04, 'stopLoss', false), 0.04);
  assert.equal(adjustedReturn(0.11, 'leverage', false), 0.22);
  assert.equal(adjustedReturn(-0.14, 'leverage', false), -0.28);
  assert.equal(adjustedReturn(-0.7, 'leverage', false), -1);
});
void test('bankruptcy on a committed market still shows RESULT before GAME OVER', () => {
  let s: State = { ...start(), debug: true, cash: 0 };
  const card = s.deck.find((c) => c.cardId === 'leverage')!;
  s.hand = [card.id];
  s = reducer(s, { type: 'SELECT_CARD', instanceId: card.id });
  s = reducer(s, { type: 'FORCE_EVENT', eventId: 'severe_crash' });
  s = reducer(s, { type: 'RESOLVE' });
  assert.equal(totalAssets(s), 0);
  assert.equal(s.phase, 'turnResult');
  assert.ok(publicMarketInfo(s).marketResult);
  assert.equal(reducer(s, { type: 'NEXT' }).phase, 'gameOver');
});
