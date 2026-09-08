import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDS,
  INITIAL_DECK,
  createDeck,
  drawHand,
  discardHand,
  addCard,
  removeCard,
  cardSummary,
  type CardId,
} from '../lib/game/cards.ts';
import { ASSETS, type AssetId, type Decision } from '../lib/game/data.ts';
import {
  createGame,
  reducer,
  previewDecision,
  totalAssets,
  cloneState,
  type State,
} from '../lib/game/engine.ts';
function decisionState(
  cardId: CardId | null,
  assetId: AssetId = 'sp500',
  eventId = 'crash',
) {
  let s = reducer(createGame(), { type: 'START', seed: 100, debug: true });
  s = reducer(s, { type: 'SELECT_ASSET', assetId });
  s = reducer(s, { type: 'FORCE_EVENT', eventId });
  s = reducer(s, { type: 'REVEAL' });
  if (cardId) {
    if (!s.deck.some((c) => c.cardId === cardId))
      addCard(s, cardId, 'reward', 0);
    const instance = s.deck.find((c) => c.cardId === cardId)!;
    s.hand = [instance.id];
    s.drawPile = s.deck.filter((c) => c.id !== instance.id).map((c) => c.id);
    s.discardPile = [];
    s = reducer(s, { type: 'SELECT_CARD', instanceId: instance.id });
  }
  return s;
}
function settle(
  cardId: CardId | null,
  asset: AssetId = 'sp500',
  event = 'crash',
  decision: Decision = 'hold',
) {
  return reducer(decisionState(cardId, asset, event), {
    type: 'DECIDE',
    decision,
  });
}
function zones(s: State) {
  const all = [...s.drawPile, ...s.hand, ...s.discardPile];
  assert.equal(all.length, s.deck.length);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...all].sort(), s.deck.map((c) => c.id).sort());
  assert.ok(s.hand.length <= 5);
}
function nextDecision(state: State, eventId: string) {
  let s = state;
  if (s.phase === 'turnResult') s = reducer(s, { type: 'NEXT' });
  if (s.phase === 'reward') s = reducer(s, { type: 'REWARD', cardId: null });
  if (s.phase === 'broker') s = reducer(s, { type: 'LEAVE_SHOP' });
  s = reducer(s, { type: 'FORCE_EVENT', eventId });
  return reducer(s, { type: 'REVEAL' });
}
void test('initial ten cards with exact counts; seeded shuffle excludes equipment and basic commands', () => {
  const s = createDeck(12);
  assert.equal(s.deck.length, 10);
  assert.deepEqual(
    s.deck.map((c) => c.cardId),
    INITIAL_DECK,
  );
  assert.deepEqual(s.drawPile, createDeck(12).drawPile);
  assert.notDeepEqual(s.drawPile, createDeck(13).drawPile);
  assert.deepEqual(
    [...new Set(INITIAL_DECK)].sort(),
    [
      'diversify',
      'stopLoss',
      'cashReserve',
      'dollarCost',
      'dividend',
      'leverage',
    ].sort(),
  );
  assert.equal(s.discardPile.length, 0);
});
void test('draw 5, discard all including unused, draw remaining 5, reshuffle without copies', () => {
  const s = createGame(100);
  drawHand(s);
  assert.equal(s.hand.length, 5);
  assert.equal(s.drawPile.length, 5);
  const first = [...s.hand];
  discardHand(s);
  assert.equal(s.discardPile.length, 5);
  drawHand(s);
  assert.equal(s.hand.length, 5);
  assert.ok(s.hand.every((id) => !first.includes(id)));
  discardHand(s);
  assert.equal(s.discardPile.length, 10);
  drawHand(s);
  assert.equal(s.hand.length, 5);
  assert.equal(s.drawPile.length, 5);
  assert.equal(s.discardPile.length, 0);
  zones(s);
});
void test('partial reshuffle fills hand; tiny and empty decks do not duplicate or loop', () => {
  const s = createGame(10);
  drawHand(s);
  discardHand(s);
  s.drawPile.push(s.discardPile.pop()!);
  drawHand(s);
  discardHand(s);
  drawHand(s);
  zones(s);
  for (const c of s.deck.slice(2)) removeCard(s, c.id);
  discardHand(s);
  drawHand(s);
  assert.equal(s.hand.length, 2);
  zones(s);
  for (const c of s.deck) removeCard(s, c.id);
  drawHand(s);
  assert.equal(s.hand.length, 0);
  zones(s);
});
void test('select, replace, deselect is reversible with no fees, investment or persistent effects', () => {
  let s = decisionState('rebalance');
  const initialTotal = totalAssets(s);
  s = reducer(s, { type: 'REBALANCE_TARGET', assetId: 'gold' });
  assert.equal(s.assetType, 'sp500');
  assert.equal(totalAssets(s), initialTotal);
  const next = s.deck.find((c) => c.cardId === 'dividend')!;
  s.hand.push(next.id);
  s.drawPile = s.drawPile.filter((id) => id !== next.id);
  s = reducer(s, { type: 'SELECT_CARD', instanceId: next.id });
  assert.equal(s.rebalanceTarget, null);
  assert.equal(s.dividendTurns, 0);
  assert.equal(cardSummary(s).totalUsed, 0);
  s = reducer(s, { type: 'SELECT_CARD', instanceId: null });
  assert.equal(totalAssets(s), initialTotal);
  assert.equal(s.selectedCardId, null);
  assert.equal(reducer(s, { type: 'SELECT_CARD', instanceId: 'bad' }), s);
});
void test('diversification: NASDAQ crash -40% → -28%; positive returns unchanged', () => {
  const s = settle('diversify', 'nasdaq');
  assert.ok(Math.abs(s.history[0].effectiveReturn + 0.28) < 1e-12);
  assert.equal(totalAssets(s), 776000);
  assert.equal(
    totalAssets(settle('diversify', 'nasdaq', 'strong_up')),
    1176000,
  );
});
void test('stop loss: NASDAQ severe crash -58% → -25%; mild declines unchanged', () => {
  assert.equal(
    totalAssets(settle('stopLoss', 'nasdaq', 'severe_crash')),
    800000,
  );
  assert.equal(
    settle('stopLoss', 'sp500', 'correction').history[0].effectiveReturn,
    -0.1,
  );
});
void test('leverage boosts both directions and never creates debt below -100%', () => {
  assert.equal(totalAssets(settle('leverage', 'nasdaq', 'recovery')), 1432000);
  const s = settle('leverage', 'nasdaq', 'severe_crash');
  assert.equal(s.investedAssets, 0);
  assert.equal(s.cash, 200000);
  assert.equal(s.phase, 'turnResult');
  const zero = decisionState('leverage', 'nasdaq', 'severe_crash');
  zero.cash = 0;
  const end = reducer(zero, { type: 'DECIDE', decision: 'hold' });
  assert.equal(end.phase, 'gameOver');
  assert.equal(totalAssets(end), 0);
  assert.equal(end.hand.length, 0);
  assert.equal(end.history.length, 1);
  assert.equal(cardSummary(end).totalUsed, 1);
});
void test('cash reserve executes before both market and command (hold/buy/panic)', () => {
  const hold = settle('cashReserve');
  assert.equal(hold.history[0].cashReserved, 160000);
  assert.equal(hold.investedAssets, 448000);
  assert.equal(hold.cash, 360000);
  const buy = settle('cashReserve', 'sp500', 'crash', 'buyMore');
  assert.equal(buy.investedAssets, 574000);
  assert.equal(buy.cash, 180000);
  const panic = settle('cashReserve', 'sp500', 'crash', 'panic');
  assert.equal(panic.investedAssets, 44800);
  assert.equal(panic.cash, 763200);
});
void test('dollar cost: only buy changes cash ratio to 75%', () => {
  const s = settle('dollarCost', 'sp500', 'crash', 'buyMore');
  assert.equal(s.cash, 50000);
  assert.equal(s.investedAssets, 665000);
  assert.equal(s.history[0].additional, 150000);
  for (const d of ['hold', 'panic'] as Decision[]) {
    const card = settle('dollarCost', 'sp500', 'crash', d);
    const noCard = settle(null, 'sp500', 'crash', d);
    assert.equal(card.cash, noCard.cash);
    assert.equal(card.investedAssets, noCard.investedAssets);
  }
});
void test('dividend includes current year, expires after third payout, and stacks duration only', () => {
  let s = settle('dividend', 'gold', 'strong_up');
  assert.equal(s.history[0].strategyDividend, 8000);
  assert.equal(s.dividendTurns, 2);
  s = nextDecision(s, 'strong_up');
  s = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.equal(s.dividendTurns, 1);
  assert.equal(s.history[1].strategyDividend, 8000);
  s = nextDecision(s, 'strong_up');
  s = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.equal(s.dividendTurns, 0);
  assert.equal(s.history[2].strategyDividend, 8000);
  s = nextDecision(s, 'strong_up');
  s = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.equal(s.history[3].strategyDividend, 0);
  let stack = decisionState('dividend', 'gold', 'strong_up');
  stack.dividendTurns = 2;
  stack = reducer(stack, { type: 'DECIDE', decision: 'hold' });
  assert.equal(stack.dividendTurns, 4);
  assert.equal(stack.history[0].strategyDividend, 8000);
});
void test('strategy dividend adds to asset dividends and is computed after panic cashout', () => {
  const hold = settle('dividend', 'dividend');
  assert.equal(hold.history[0].dividend, 9360);
  assert.equal(hold.history[0].strategyDividend, 6240);
  assert.equal(totalAssets(hold), 839600);
  const panic = settle('dividend', 'dividend', 'crash', 'panic');
  assert.equal(panic.history[0].dividend, 936);
  assert.equal(panic.history[0].strategyDividend, 624);
  assert.equal(panic.cash, 763160);
});
void test('rebalance is staged, charges normal fee at command, and keeps current event/RNG', () => {
  let s = decisionState('rebalance', 'nasdaq', 'crash');
  const before = cloneState(s);
  s = reducer(s, { type: 'REBALANCE_TARGET', assetId: 'gold' });
  assert.equal(s.assetType, 'nasdaq');
  assert.equal(s.cash, 200000);
  const outcome = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.equal(outcome.assetType, 'gold');
  assert.equal(outcome.cash, 190000);
  assert.equal(outcome.investedAssets, 880000);
  assert.equal(outcome.history[0].cardRebalanceFee, 10000);
  assert.equal(outcome.history[0].assetBefore, 'nasdaq');
  assert.equal(outcome.eventId, before.eventId);
  assert.equal(outcome.rng, before.rng);
  const same = settle('rebalance');
  assert.equal(same.history[0].cardRebalanceFee, 0);
  assert.equal(same.history[0].cardId, 'rebalance');
});
void test('contrarian arms only on crash+buy, waits through negative returns, triggers once', () => {
  let s = settle('contrarian', 'sp500', 'crash', 'buyMore');
  assert.equal(s.contrarianPending, true);
  assert.equal(s.history[0].effectiveReturn, -0.3);
  s = nextDecision(s, 'correction');
  s = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.equal(s.contrarianPending, true);
  s = nextDecision(s, 'recovery');
  s = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.equal(s.history[2].effectiveReturn, 0.26);
  assert.equal(totalAssets(s), 814420);
  assert.equal(s.contrarianPending, false);
  s = nextDecision(s, 'recovery');
  s = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.equal(s.history[3].effectiveReturn, 0.2);
  assert.equal(
    settle('contrarian', 'sp500', 'crash', 'hold').contrarianPending,
    false,
  );
  assert.equal(
    settle('contrarian', 'sp500', 'correction', 'buyMore').contrarianPending,
    false,
  );
});
void test('contrarian is not consumed in its arming turn even if gold gains during crash; stacks with leverage on next positive', () => {
  let s = settle('contrarian', 'gold', 'crash', 'buyMore');
  assert.equal(s.history[0].effectiveReturn, 0.1);
  assert.equal(s.history[0].contrarianTriggered, false);
  assert.equal(s.contrarianPending, true);
  s = decisionState('leverage', 'sp500', 'recovery');
  s.contrarianPending = true;
  const out = reducer(s, { type: 'DECIDE', decision: 'hold' });
  assert.ok(Math.abs(out.history[0].effectiveReturn - 0.468) < 1e-12);
  assert.equal(out.contrarianPending, false);
});
void test('every card × every command: preview exactly matches settlement, live state unchanged, one card use', () => {
  for (const cardId of Object.keys(CARDS) as CardId[]) {
    for (const decision of ['hold', 'panic', 'buyMore'] as Decision[]) {
      const s = decisionState(cardId, 'nasdaq', 'severe_crash');
      const before = structuredClone(s);
      const preview = previewDecision(s, decision)!;
      assert.deepEqual(s, before);
      const after = reducer(s, { type: 'DECIDE', decision });
      assert.deepEqual(preview, after.history[0]);
      assert.equal(cardSummary(after).totalUsed, 1);
      assert.equal(after.hand.length, 0);
      assert.equal(reducer(after, { type: 'DECIDE', decision }), after);
      zones(after);
    }
  }
});
void test('all three commands work with no hand, no selected card and no cash', () => {
  for (const decision of ['hold', 'panic', 'buyMore'] as Decision[]) {
    const s = decisionState(null);
    for (const c of s.deck) removeCard(s, c.id);
    s.cash = 0;
    const after = reducer(s, { type: 'DECIDE', decision });
    assert.equal(after.history.length, 1);
    assert.equal(after.history[0].cardId, null);
    assert.equal(cardSummary(after).totalUsed, 0);
    assert.equal(after.investedAssets, decision === 'panic' ? 56000 : 560000);
  }
});
void test('reward at year 3: three distinct choices, reject invalid, acquire once into deck', () => {
  let s = decisionState(null);
  for (let turn = 1; turn <= 3; turn++) {
    s = reducer(s, { type: 'DECIDE', decision: 'hold' });
    if (turn < 3) s = nextDecision(s, 'normal_up');
  }
  assert.equal(s.phase, 'turnResult');
  s = reducer(s, { type: 'NEXT' });
  assert.equal(s.phase, 'reward');
  assert.equal(s.rewardChoices.length, 3);
  assert.equal(new Set(s.rewardChoices).size, 3);
  assert.equal(reducer(s, { type: 'REWARD', cardId: 'bad' as CardId }), s);
  const choice = s.rewardChoices[0];
  const after = reducer(s, { type: 'REWARD', cardId: choice });
  assert.equal(after.deck.length, 11);
  assert.equal(after.acquisitions[0].cardId, choice);
  assert.equal(after.acquisitions[0].source, 'reward');
  assert.equal(after.turn, 4);
  assert.equal(reducer(after, { type: 'REWARD', cardId: choice }), after);
  zones(after);
  const skip = reducer(s, { type: 'REWARD', cardId: null });
  assert.equal(skip.deck.length, 10);
  assert.equal(skip.acquisitions.length, 0);
});
function shopState() {
  const s = decisionState(null);
  s.phase = 'broker';
  s.shopOffers = [
    { id: 'offer-a', cardId: 'diversify', purchased: false },
    { id: 'offer-b', cardId: 'rebalance', purchased: false },
    { id: 'offer-c', cardId: 'leverage', purchased: false },
  ];
  return s;
}
void test('shop: asset switch stays in shop, purchase once, payment cash first then investment', () => {
  let s = shopState();
  s = reducer(s, { type: 'SHOP_ASSET', assetId: 'gold' });
  assert.equal(s.phase, 'broker');
  assert.equal(s.cash, 190000);
  s = reducer(s, { type: 'SHOP_BUY', offerId: 'offer-a' });
  assert.equal(s.cash, 140000);
  assert.equal(s.deck.length, 11);
  assert.equal(s.acquisitions[0].source, 'shop');
  assert.ok(s.discardPile.includes(s.deck.at(-1)!.id));
  assert.equal(reducer(s, { type: 'SHOP_BUY', offerId: 'offer-a' }), s);
  s.cash = 1000;
  const before = totalAssets(s);
  s = reducer(s, { type: 'SHOP_BUY', offerId: 'offer-b' });
  assert.equal(totalAssets(s), before - 60000);
  assert.equal(s.cash, 0);
  assert.equal(s.investedAssets, 741000);
  zones(s);
});
void test('shop: removal removes only one copy from any zone, fees, refill on exit, invalid IDs fail safely', () => {
  for (const zone of ['hand', 'drawPile', 'discardPile'] as const) {
    let s = shopState();
    if (zone === 'discardPile') discardHand(s);
    const id = s[zone][0];
    assert.ok(id);
    const sameType = s.deck.find((c) => c.id === id)!.cardId;
    const count = s.deck.filter((c) => c.cardId === sameType).length;
    const before = totalAssets(s);
    const after = reducer(s, { type: 'SHOP_REMOVE', instanceId: id });
    assert.equal(after.deck.length, 9);
    assert.equal(
      after.deck.filter((c) => c.cardId === sameType).length,
      count - 1,
    );
    assert.equal(totalAssets(after), before - 30000);
    assert.equal(after.shopSpent, 30000);
    assert.ok(!after[zone].includes(id));
    assert.equal(
      reducer(after, { type: 'SHOP_REMOVE', instanceId: id }),
      after,
    );
    zones(after);
    s = reducer(after, { type: 'LEAVE_SHOP' });
    assert.equal(s.phase, 'forecast');
    assert.equal(s.hand.length, 5);
    zones(s);
  }
});
void test('insufficient funds rejects shop purchase/removal; exact payment triggers GAME OVER', () => {
  const s = shopState();
  s.investedAssets = 10000;
  s.cash = 100;
  assert.equal(reducer(s, { type: 'SHOP_BUY', offerId: 'offer-a' }), s);
  assert.equal(
    reducer(s, { type: 'SHOP_REMOVE', instanceId: s.deck[0].id }),
    s,
  );
  s.cash = 20000;
  s.investedAssets = 10000;
  const out = reducer(s, { type: 'SHOP_REMOVE', instanceId: s.deck[0].id });
  assert.equal(out.phase, 'gameOver');
  assert.equal(totalAssets(out), 0);
  assert.equal(out.maxDrawdown, -1);
});
void test('card summaries count uses, ties, acquisitions and final deck; reset clears buffs', () => {
  const s = settle('dividend');
  s.cardUsageCounts.diversify = 1;
  addCard(s, 'rebalance', 'shop', 1);
  const summary = cardSummary(s);
  assert.equal(summary.totalUsed, 2);
  assert.equal(summary.mostUsed.length, 2);
  assert.equal(summary.deckSize, 11);
  const reset = reducer(s, { type: 'TITLE' });
  assert.equal(reset.deck.length, 10);
  assert.equal(reset.dividendTurns, 0);
  assert.equal(reset.contrarianPending, false);
  assert.equal(reset.acquisitions.length, 0);
  assert.equal(cardSummary(reset).totalUsed, 0);
});
void test('100 full runs cover rewards, shopping, removal and card play with consistent zones, history and terminal result', () => {
  let clears = 0;
  for (let seed = 0; seed < 100; seed++) {
    let s = reducer(createGame(), { type: 'START', seed });
    s = reducer(s, {
      type: 'SELECT_ASSET',
      assetId: (Object.keys(ASSETS) as AssetId[])[seed % 5],
    });
    let steps = 0;
    while (!['clear', 'gameOver'].includes(s.phase)) {
      assert.ok(++steps < 180);
      zones(s);
      const before = structuredClone(s);
      if (s.phase === 'forecast') s = reducer(s, { type: 'REVEAL' });
      else if (s.phase === 'decision') {
        if (s.hand.length)
          s = reducer(s, {
            type: 'SELECT_CARD',
            instanceId: s.hand[(seed + s.turn) % s.hand.length],
          });
        if (
          s.deck.find((c) => c.id === s.selectedCardId)?.cardId === 'rebalance'
        )
          s = reducer(s, { type: 'REBALANCE_TARGET', assetId: 'gold' });
        s = reducer(s, {
          type: 'DECIDE',
          decision:
            seed % 3 === 0 ? 'buyMore' : seed % 3 === 1 ? 'hold' : 'panic',
        });
      } else if (s.phase === 'turnResult') s = reducer(s, { type: 'NEXT' });
      else if (s.phase === 'reward')
        s = reducer(s, { type: 'REWARD', cardId: s.rewardChoices[seed % 3] });
      else if (s.phase === 'broker') {
        if (totalAssets(s) > 300000) {
          s = reducer(s, { type: 'SHOP_BUY', offerId: s.shopOffers[0].id });
          s = reducer(s, { type: 'SHOP_REMOVE', instanceId: s.deck[0].id });
        }
        s = reducer(s, { type: 'LEAVE_SHOP' });
      }
      assert.ok(totalAssets(s) >= 0);
      assert.ok(Number.isInteger(totalAssets(s)));
      assert.ok(
        s.history.length >= before.history.length &&
          s.history.length <= before.history.length + 1,
      );
    }
    zones(s);
    if (s.phase === 'clear') {
      clears++;
      assert.equal(s.history.length, 20);
      assert.equal(
        s.acquisitions.filter((a) => a.source === 'reward').length,
        6,
      );
    } else assert.equal(totalAssets(s), 0);
    assert.equal(
      s.history.length,
      Object.values(s.decisionCounts).reduce((a, b) => a + b, 0),
    );
    assert.ok(cardSummary(s).totalUsed <= s.history.length);
    assert.equal(s.hand.length, 0);
  }
  assert.ok(clears > 80);
});
void test('shop bankruptcy closes the hand and records a zero endpoint in asset chart', async () => {
  const { assetHistoryPoints } = await import('../lib/game/engine.ts');
  let s = settle(null);
  s = nextDecision(s, 'normal_up');
  s.phase = 'broker';
  s.cash = 30000;
  s.investedAssets = 0;
  const out = reducer(s, { type: 'SHOP_REMOVE', instanceId: s.deck[0].id });
  assert.equal(out.phase, 'gameOver');
  assert.equal(out.hand.length, 0);
  zones(out);
  const points = assetHistoryPoints(out);
  assert.equal(points.length, 3);
  assert.deepEqual(points.at(-1), { year: 2, total: 0 });
  assert.deepEqual(points[1], { year: 1, total: 760000 });
});
