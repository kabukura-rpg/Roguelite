import test from 'node:test';
import assert from 'node:assert/strict';
import { INCIDENTS } from '../lib/game/incidents.ts';
import { addCard, cardSummary, type CardId } from '../lib/game/cards.ts';
import {
  createGame,
  reducer,
  totalAssets,
  type State,
} from '../lib/game/engine.ts';

function turn(cardId: CardId | null, eventId = 'crash'): State {
  let s = reducer(createGame(), { type: 'START', seed: 123, debug: true });
  s = reducer(s, { type: 'SELECT_ASSET', assetId: 'sp500' });
  s = reducer(s, { type: 'FORCE_EVENT', eventId });
  s = reducer(s, { type: 'REVEAL' });
  if (cardId) {
    if (!s.deck.some((c) => c.cardId === cardId))
      addCard(s, cardId, 'reward', 0);
    const card = s.deck.find((c) => c.cardId === cardId)!;
    s.hand = [card.id];
    s.drawPile = s.deck.filter((c) => c.id !== card.id).map((c) => c.id);
    s.discardPile = [];
    s = reducer(s, { type: 'SELECT_CARD', instanceId: card.id });
  }
  return s;
}

void test('normal turn: card selection leaves balances unchanged until a single resolve', () => {
  const s = turn('diversify');
  const before = structuredClone(s);
  assert.equal(totalAssets(s), 1_000_000);
  const result = reducer(s, { type: 'RESOLVE' });
  assert.deepEqual(s, before);
  assert.equal(result.phase, 'turnResult');
  assert.equal(result.history[0].resolution, 'strategy');
  assert.equal(result.history[0].cardId, 'diversify');
  assert.equal(totalAssets(result), 832_000);
  assert.equal(cardSummary(result).totalUsed, 1);
  assert.equal(result.hand.length, 0);
  assert.equal(reducer(result, { type: 'RESOLVE' }), result);
});

void test('normal turn: decline or no hand still resolves without a command', () => {
  for (const empty of [true, false]) {
    let s = turn('leverage');
    s = reducer(s, { type: 'SELECT_CARD', instanceId: null });
    if (empty) {
      s.discardPile.push(...s.hand);
      s.hand = [];
    }
    const out = reducer(s, { type: 'RESOLVE' });
    assert.equal(totalAssets(out), 760_000);
    assert.equal(out.history[0].cardId, null);
    assert.equal(cardSummary(out).totalUsed, 0);
  }
});

void test('dollar cost invests 75% of cash by itself before the market', () => {
  const out = reducer(turn('dollarCost'), { type: 'RESOLVE' });
  assert.equal(out.history[0].additional, 150_000);
  assert.equal(out.cash, 50_000);
  assert.equal(out.investedAssets, 665_000);
});

void test('contrarian invests 50% by itself and arms only on a crash', () => {
  for (const event of ['crash', 'normal_up']) {
    const out = reducer(turn('contrarian', event), { type: 'RESOLVE' });
    assert.equal(out.history[0].additional, 100_000);
    assert.equal(out.cash, 100_000);
    assert.equal(out.contrarianPending, event === 'crash');
    assert.equal(out.history[0].contrarianTriggered, false);
  }
});

void test('cash reserve transfers 20% before settlement; no additional purchase', () => {
  const out = reducer(turn('cashReserve'), { type: 'RESOLVE' });
  assert.equal(out.history[0].cashReserved, 160_000);
  assert.equal(out.history[0].additional, 0);
  assert.equal(out.cash, 360_000);
  assert.equal(out.investedAssets, 448_000);
});

void test('rebalance charges once on resolve and cannot change balances when staged', () => {
  let s = turn('rebalance');
  s = reducer(s, { type: 'REBALANCE_TARGET', assetId: 'gold' });
  assert.equal(s.assetType, 'sp500');
  assert.equal(totalAssets(s), 1_000_000);
  const out = reducer(s, { type: 'RESOLVE' });
  assert.equal(out.assetType, 'gold');
  assert.equal(out.history[0].cardRebalanceFee, 10_000);
  assert.equal(out.cash, 190_000);
  assert.equal(out.investedAssets, 880_000);
});

void test('normal resolve is unavailable before market reveal or in other phases', () => {
  const s = turn(null);
  for (const phase of [
    'title',
    'select',
    'forecast',
    'broker',
    'reward',
    'clear',
    'gameOver',
  ] as const) {
    const state = { ...s, phase };
    assert.equal(reducer(state, { type: 'RESOLVE' }), state);
  }
});

void test('100 runs complete through the card-only flow, rewards and shops', () => {
  for (let seed = 0; seed < 100; seed++) {
    let s = reducer(createGame(), { type: 'START', seed });
    s = reducer(s, { type: 'SELECT_ASSET', assetId: 'sp500' });
    let steps = 0;
    while (!['clear', 'gameOver'].includes(s.phase)) {
      assert.ok(++steps < 120);
      if (s.phase === 'forecast') s = reducer(s, { type: 'REVEAL' });
      else if (s.phase === 'decision') {
        s = reducer(s, {
          type: 'SELECT_CARD',
          instanceId: seed % 2 ? (s.hand[0] ?? null) : null,
        });
        s = reducer(s, { type: 'RESOLVE' });
      } else if (s.phase === 'turnResult') s = reducer(s, { type: 'NEXT' });
      else if (s.phase === 'incident') {
        const e = INCIDENTS.find((e) => e.id === s.currentIncident)!;
        s = reducer(s, {
          type: 'INCIDENT_CHOICE',
          choiceId:
            e.kind === 'life'
              ? 'pay'
              : e.kind === 'shock'
                ? 'hold'
                : e.choices!.find((c) => !c.cost)!.id,
        });
      } else if (s.phase === 'incidentResult')
        s = reducer(s, { type: 'INCIDENT_NEXT' });
      else if (s.phase === 'reward')
        s = reducer(s, { type: 'REWARD', cardId: s.rewardChoices[0] });
      else if (s.phase === 'broker') s = reducer(s, { type: 'LEAVE_SHOP' });
    }
    if (s.phase === 'clear') {
      assert.equal(s.history.length, 20);
      assert.ok(s.incidentHistory.length >= 4);
    } else assert.equal(totalAssets(s), 0);
    assert.ok(
      s.history.every(
        (h) => h.resolution === 'strategy' && h.decision !== 'panic',
      ),
    );
    const zones = [...s.hand, ...s.drawPile, ...s.discardPile];
    assert.equal(new Set(zones).size, s.deck.length);
    assert.equal(zones.length, s.deck.length);
  }
});
