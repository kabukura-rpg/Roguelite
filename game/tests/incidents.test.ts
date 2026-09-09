import { generateForecast, FORECAST_CONFIG } from '../lib/game/forecast.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INCIDENTS,
  createIncidents,
  drawIncident,
  type IncidentRecord,
} from '../lib/game/incidents.ts';
import {
  createGame,
  reducer,
  totalAssets,
  assetHistoryPoints,
  type State,
} from '../lib/game/engine.ts';

function encounter(id: string): State {
  return {
    ...createGame(42),
    phase: 'incident',
    currentIncident: id,
    turn: 2,
    lastIncidentTurn: 2,
  };
}
function emptyRecord(id: string, turn: number): IncidentRecord {
  return {
    id,
    turn,
    choice: '',
    message: '',
    cashBefore: 0,
    investedBefore: 0,
    cashAfter: 0,
    investedAfter: 0,
    totalAfter: 0,
    cost: 0,
    forcedSale: 0,
    rate: null,
    card: null,
    insight: false,
    shield: false,
  };
}
void test('2000 schedules guarantee 4+ distinct events in 20 years with no adjacent years', () => {
  let count = 0;
  const seen = new Set<string>();
  for (let seed = 0; seed < 2000; seed++) {
    const s = createIncidents(seed);
    for (let turn = 1; turn <= 20; turn++) {
      const event = drawIncident(s, turn);
      assert.equal(drawIncident(s, turn), null);
      if (event) {
        const last = s.incidentHistory.at(-1);
        if (last) assert.ok(turn - last.turn >= 2);
        s.incidentHistory.push(emptyRecord(event.id, turn));
        seen.add(event.id);
      }
    }
    assert.ok(s.incidentHistory.length >= 4 && s.incidentHistory.length <= 10);
    assert.equal(
      new Set(s.incidentHistory.map((h) => h.id)).size,
      s.incidentHistory.length,
    );
    count += s.incidentHistory.length;
  }
  assert.equal(seen.size, INCIDENTS.length);
  assert.ok(count / 2000 >= 4 && count / 2000 < 6);
});
void test('same seed reproduces schedules; normal market and deck RNG remain independent', () => {
  const a = createGame(7),
    b = createGame(7);
  for (let turn = 1; turn <= 20; turn++) {
    const one = drawIncident(a, turn),
      two = drawIncident(b, turn);
    assert.deepEqual(one, two);
    if (one && two) {
      a.incidentHistory.push(emptyRecord(one.id, turn));
      b.incidentHistory.push(emptyRecord(two.id, turn));
    }
  }
  assert.equal(a.rng, createGame(7).rng);
  assert.equal(a.cardRng, createGame(7).cardRng);
});
void test('life costs use cash first, force-sell only the shortfall and never create debt', () => {
  for (const cash of [100000, 10000, 0]) {
    const s = encounter('injury');
    s.cash = cash;
    const before = structuredClone(s);
    const out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
    assert.deepEqual(s, before);
    assert.equal(out.phase, 'incidentResult');
    assert.equal(totalAssets(out), totalAssets(s) - 60000);
    assert.equal(out.cash, Math.max(0, cash - 60000));
    assert.equal(out.incidentHistory[0].forcedSale, Math.max(0, 60000 - cash));
    assert.equal(out.investedAssets, 800000 - Math.max(0, 60000 - cash));
    assert.equal(
      reducer(out, { type: 'INCIDENT_CHOICE', choiceId: 'pay' }),
      out,
    );
  }
  const poor = encounter('injury');
  poor.cash = 100;
  poor.investedAssets = 900;
  const out = reducer(poor, { type: 'INCIDENT_CHOICE', choiceId: 'pay' });
  assert.equal(out.phase, 'incidentResult');
  assert.equal(totalAssets(out), 0);
  assert.equal(out.incidentHistory[0].cost, 1000);
  assert.equal(out.maxDrawdown, -1);
  assert.equal(reducer(out, { type: 'INCIDENT_NEXT' }).phase, 'gameOver');
});
void test('shock has no preselected result; panic sells first, buy adds first, no extra annual dividends', () => {
  const start = encounter('credit');
  start.dividendTurns = 2;
  start.nextLossShield = true;
  start.contrarianPending = true;
  const outcomes = ['panic', 'hold', 'buyMore'].map((choiceId) =>
    reducer(start, { type: 'INCIDENT_CHOICE', choiceId }),
  );
  const [panic, hold, buy] = outcomes;
  assert.ok(panic.incidentHistory[0].rate! < 0);
  assert.equal(panic.incidentHistory[0].rate, hold.incidentHistory[0].rate);
  assert.equal(hold.incidentHistory[0].rate, buy.incidentHistory[0].rate);
  assert.ok(
    totalAssets(panic) > totalAssets(hold) &&
      totalAssets(hold) > totalAssets(buy),
  );
  assert.equal(panic.cash, 920000);
  assert.equal(buy.cash, 100000);
  assert.equal(panic.panicReentryPending, true);
  for (const s of outcomes) {
    assert.equal(s.history.length, 0);
    assert.equal(s.dividendTurns, 2);
    assert.equal(s.nextLossShield, true);
    assert.equal(s.contrarianPending, true);
    assert.equal(s.rng, start.rng);
    assert.equal(s.cardRng, start.cardRng);
  }
});
void test('invalid or unaffordable optional choices are rejected without RNG changes', () => {
  const s = encounter('seminar');
  s.cash = 19999;
  assert.equal(reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'join' }), s);
  assert.equal(reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'pay' }), s);
  assert.equal(reducer(s, { type: 'RESOLVE' }), s);
  assert.equal(reducer(s, { type: 'NEXT' }), s);
});
void test('chance awards card into discard, improves forecast and preserves live state', () => {
  const s = encounter('seminar');
  const out = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'join' });
  assert.equal(out.cash, 180000);
  assert.equal(out.deck.length, s.deck.length + 1);
  assert.ok(out.discardPile.includes(out.deck.at(-1)!.id));
  assert.equal(out.acquisitions.at(-1)!.source, 'incident');
  assert.equal(out.forecastInsight, true);
  assert.equal(s.forecastInsight, false);
  const reward = reducer(out, { type: 'INCIDENT_NEXT' });
  assert.equal(reward.turn, 3);
});
void test('temporary protection and forecast insight are consumed by exactly the next normal market', () => {
  let s = reducer(encounter('weekend'), {
    type: 'INCIDENT_CHOICE',
    choiceId: 'rest',
  });
  s = {
    ...s,
    phase: 'forecast',
    forecast: generateForecast(0.4, [], FORECAST_CONFIG.insightBonus),
    debug: true,
    forcedEventId: 'crash',
    forecastInsight: true,
  };
  const out = reducer(s, { type: 'RESOLVE' });
  assert.equal(out.history[0].effectiveReturn, out.history[0].baseReturn * 0.5);
  assert.equal(out.nextLossShield, false);
  assert.equal(out.forecastInsight, false);
});
void test('year 3 rewards wait for the incident, and year 20 waits for its outcome before clear', () => {
  for (const turn of [3, 20]) {
    let s = encounter('income');
    s.turn = turn;
    s = reducer(s, { type: 'INCIDENT_CHOICE', choiceId: 'cash' });
    assert.equal(s.cash, 240000);
    assert.equal(s.phase, 'incidentResult');
    s = reducer(s, { type: 'INCIDENT_NEXT' });
    assert.equal(s.phase, turn === 3 ? 'reward' : 'clear');
    assert.equal(s.turn, turn);
    assert.equal(reducer(s, { type: 'INCIDENT_NEXT' }), s);
  }
});
void test('asset chart includes both normal settlement and the later incident', () => {
  const s = {
    ...createGame(),
    phase: 'forecast' as const,
    forecast: generateForecast(0),
    debug: true,
    forcedEventId: 'normal_up',
  };
  let out = reducer(s, { type: 'RESOLVE' });
  out = { ...out, phase: 'incident', currentIncident: 'income' };
  out = reducer(out, { type: 'INCIDENT_CHOICE', choiceId: 'cash' });
  const points = assetHistoryPoints(out);
  assert.equal(points.length, 3);
  // The incident sits half a year after its market so the chart never doubles back.
  assert.equal(points[2].year, points[1].year + 0.5);
  assert.equal(points.at(-1)!.total, totalAssets(out));
});
void test('normal year 20 cannot skip the guaranteed final incident or clear early', () => {
  let s = reducer(
    {
      ...createGame(),
      phase: 'forecast',
      forecast: generateForecast(0),
      debug: true,
      forcedEventId: 'normal_up',
    },
    { type: 'RESOLVE' },
  );
  const first = s.history[0];
  s.history = Array.from({ length: 19 }, (_, i) => ({
    ...first,
    turn: i + 1,
    year: i + 1,
  }));
  s.turn = 20;
  s.phase = 'forecast';
  s.incidentHistory = ['injury', 'appliance', 'repair'].map((id, i) =>
    emptyRecord(id, 13 + i * 2),
  );
  s.lastIncidentTurn = 17;
  s.incidentCheckedTurn = 19;
  s = reducer(s, { type: 'RESOLVE' });
  assert.equal(s.phase, 'turnResult');
  assert.equal(s.history.length, 20);
  s = reducer(s, { type: 'NEXT' });
  assert.equal(s.phase, 'incident');
  const event = INCIDENTS.find((e) => e.id === s.currentIncident)!;
  const choiceId =
    event.kind === 'shock'
      ? 'hold'
      : event.kind === 'life'
        ? 'pay'
        : event.choices!.find((c) => !c.cost)!.id;
  s = reducer(s, { type: 'INCIDENT_CHOICE', choiceId });
  assert.equal(s.phase, 'incidentResult');
  assert.equal(s.incidentHistory.length, 4);
  assert.equal(reducer(s, { type: 'INCIDENT_NEXT' }).phase, 'clear');
});
