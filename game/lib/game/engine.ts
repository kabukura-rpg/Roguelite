import {
  CARDS,
  CARD_CONFIG as K,
  createDeck,
  drawHand,
  discardHand,
  selectedCard,
  randomCardChoices,
  addCard,
  removeCard,
  type CardId,
  type DeckState,
} from './cards.ts';
import {
  ASSETS,
  MARKET_EVENTS,
  GAME_CONFIG as C,
  RANKS,
  type AssetId,
  type Decision,
  type MarketEvent,
} from './data.ts';
export type Phase =
  | 'title'
  | 'select'
  | 'broker'
  | 'forecast'
  | 'decision'
  | 'turnResult'
  | 'reward'
  | 'clear'
  | 'gameOver';
export type History = {
  turn: number;
  year: number;
  assetType: AssetId;
  marketEvent: string;
  decision: Decision;
  investedBefore: number;
  cashBefore: number;
  investedAfter: number;
  cashAfter: number;
  totalAfter: number;
  drawdown: number;
  dividend: number;
  brokerFee: number;
  reentry: number;
  additional: number;
  cardId: CardId | null;
  assetBefore: AssetId;
  baseReturn: number;
  effectiveReturn: number;
  strategyDividend: number;
  cashReserved: number;
  contrarianTriggered: boolean;
  contrarianArmed: boolean;
  cardRebalanceFee: number;
  shopSpent: number;
};
export type State = DeckState & {
  phase: Phase;
  turn: number;
  investedAssets: number;
  cash: number;
  assetType: AssetId;
  peakAssets: number;
  maxDrawdown: number;
  previousMarketEvent: string | null;
  panicReentryPending: boolean;
  panicPenalty: boolean;
  turnsSinceBroker: number;
  history: History[];
  decisionCounts: Record<Decision, number>;
  crashCount: number;
  severeCrashCount: number;
  assetUsageTurns: Record<AssetId, number>;
  seed: number;
  rng: number;
  eventId: string | null;
  reentry: number;
  brokerFee: number;
  brokerVisits: number[];
  debug: boolean;
  rebalanceTarget: AssetId | null;
  shopSpent: number;
};
export type Action =
  | { type: 'START'; seed: number; debug?: boolean }
  | { type: 'SELECT_ASSET'; assetId: AssetId }
  | { type: 'BROKER'; assetId: AssetId }
  | { type: 'REVEAL' }
  | { type: 'SELECT_CARD'; instanceId: string | null }
  | { type: 'REBALANCE_TARGET'; assetId: AssetId }
  | { type: 'REWARD'; cardId: CardId | null }
  | { type: 'SHOP_ASSET'; assetId: AssetId }
  | { type: 'SHOP_BUY'; offerId: string }
  | { type: 'SHOP_REMOVE'; instanceId: string }
  | { type: 'LEAVE_SHOP' }
  | { type: 'DECIDE'; decision: Decision }
  | { type: 'NEXT' }
  | { type: 'TITLE' }
  | { type: 'FORCE_EVENT'; eventId: string };
export const totalAssets = (s: Pick<State, 'investedAssets' | 'cash'>) =>
  s.investedAssets + s.cash;
export const money = (n: number) => Math.max(0, Math.round(n));
export function createGame(seed = 1, debug = false): State {
  return {
    ...createDeck(seed),
    rebalanceTarget: null,
    shopSpent: 0,
    phase: 'title',
    turn: 1,
    investedAssets: C.initialInvested,
    cash: C.initialCash,
    assetType: 'sp500',
    peakAssets: C.initialTotal,
    maxDrawdown: 0,
    previousMarketEvent: null,
    panicReentryPending: false,
    panicPenalty: false,
    turnsSinceBroker: 0,
    history: [],
    decisionCounts: { panic: 0, hold: 0, buyMore: 0 },
    crashCount: 0,
    severeCrashCount: 0,
    assetUsageTurns: { sp500: 0, nasdaq: 0, dividend: 0, gold: 0, bonds: 0 },
    seed: seed >>> 0,
    rng: seed >>> 0,
    eventId: null,
    reentry: 0,
    brokerFee: 0,
    brokerVisits: [],
    debug,
  };
}
export function random(s: State) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function getAdjustedEventWeights(
  history: Pick<History, 'marketEvent'>[],
) {
  const last = history.at(-1)?.marketEvent;
  const before = history.at(-2)?.marketEvent;
  return MARKET_EVENTS.map((event) => {
    let weight = event.weight;
    if (last === 'crash' || last === 'severe_crash') {
      if (event.id === 'recovery') weight *= 2.5;
      if (event.id === 'bubble') weight *= 0.3;
      if (event.id === 'strong_up') weight *= 1.3;
    }
    if (last === 'bubble') {
      if (event.id === 'correction') weight *= 1.5;
      if (event.id === 'crash') weight *= 1.8;
      if (event.id === 'severe_crash') weight *= 1.5;
    }
    if (last === 'strong_up' && event.id === 'bubble') weight *= 1.4;
    if (event.id === last) weight *= before === last ? 0 : 0.35;
    return { id: event.id, weight };
  });
}
export function selectMarketEvent(s: State) {
  const weights = getAdjustedEventWeights(s.history);
  let roll = random(s) * weights.reduce((n, e) => n + e.weight, 0);
  for (const e of weights) {
    roll -= e.weight;
    if (roll < 0) return e.id;
  }
  return weights.filter((e) => e.weight > 0).at(-1)!.id;
}
export function updateDrawdown(s: State) {
  const total = totalAssets(s);
  s.peakAssets = Math.max(s.peakAssets, total);
  const dd = s.peakAssets > 0 ? (total - s.peakAssets) / s.peakAssets : 0;
  s.maxDrawdown = Math.min(s.maxDrawdown, dd);
  return dd;
}
export function applyPanicReentry(s: State) {
  s.reentry = 0;
  if (s.panicReentryPending) {
    s.reentry = money(s.cash * C.panicReentryRatio);
    s.cash -= s.reentry;
    s.investedAssets += s.reentry;
    s.panicReentryPending = false;
  }
}
export function shouldShowBroker(turn: number, gap: number, roll: number) {
  return turn > 2 && gap >= 3 && (gap >= 5 || roll < (gap === 3 ? 0.3 : 0.6));
}
export function showForecast(s: State) {
  s.eventId = selectMarketEvent(s);
  s.phase = 'forecast';
}
export function checkGameOver(s: State) {
  return totalAssets(s) <= 0;
}
export function checkGameClear(s: State) {
  return s.history.length >= C.totalTurns && totalAssets(s) > 0;
}
export function startTurn(s: State) {
  if (checkGameOver(s)) {
    s.phase = 'gameOver';
    return;
  }
  s.brokerFee = 0;
  s.shopSpent = 0;
  s.rebalanceTarget = null;
  s.selectedCardId = null;
  applyPanicReentry(s);
  drawHand(s);
  s.turnsSinceBroker++;
  if (
    shouldShowBroker(
      s.turn,
      s.turnsSinceBroker,
      s.turnsSinceBroker >= 3 ? random(s) : 1,
    )
  ) {
    s.phase = 'broker';
    s.turnsSinceBroker = 0;
    s.brokerVisits.push(s.turn);
    s.shopOffers = randomCardChoices(s).map((cardId, i) => ({
      id: `shop-${s.turn}-${i}`,
      cardId,
      purchased: false,
    }));
  } else showForecast(s);
}
export function brokerFee(s: State) {
  return Math.max(C.brokerMinimumFee, money(totalAssets(s) * C.brokerFeeRate));
}
// All shop payments use cash first, then invested assets; no debt is created.
export function payCost(s: State, cost: number) {
  const paid = Math.min(totalAssets(s), cost);
  const fromCash = Math.min(s.cash, paid);
  s.cash -= fromCash;
  s.investedAssets = money(s.investedAssets - (paid - fromCash));
  updateDrawdown(s);
  if (checkGameOver(s)) s.phase = 'gameOver';
  return paid;
}
export function changeAsset(s: State, assetId: AssetId, leave = true) {
  if (s.assetType !== assetId) {
    s.brokerFee += payCost(s, brokerFee(s));
    s.assetType = assetId;
  }
  if (checkGameOver(s)) s.phase = 'gameOver';
  else if (leave) {
    drawHand(s);
    showForecast(s);
  }
}
export function applyMarketReturn(s: State, r: number) {
  s.investedAssets = money(s.investedAssets * (1 + r));
}
export function applyHold(s: State, r: number) {
  applyMarketReturn(s, r);
}
export function applyBuyMore(s: State, r: number, ratio = C.buyMoreCashRatio) {
  const additional = money(s.cash * ratio);
  s.cash -= additional;
  s.investedAssets += additional;
  applyMarketReturn(s, r);
  return additional;
}
export function applyPanicSell(s: State, r: number) {
  applyMarketReturn(s, r);
  const sold = money(s.investedAssets * C.panicCashoutRatio);
  s.cash += sold;
  s.investedAssets -= sold;
  s.panicReentryPending = true;
  s.panicPenalty = true;
}
export function applyDividend(s: State) {
  const dividend = money(s.investedAssets * ASSETS[s.assetType].dividendRate);
  s.cash += dividend;
  return dividend;
}
export function adjustedReturn(
  base: number,
  cardId: CardId | null,
  contrarian: boolean,
) {
  let rate = base;
  if (cardId === 'diversify' && rate < 0) rate *= K.diversificationFactor;
  if (cardId === 'stopLoss') rate = Math.max(K.stopLossFloor, rate);
  if (cardId === 'leverage') rate *= K.leverageFactor;
  if (contrarian && base > 0) rate *= K.contrarianFactor;
  return rate;
}
export function applyDecision(
  s: State,
  decision: Decision,
  event: MarketEvent,
) {
  const investedBefore = s.investedAssets,
    cashBefore = s.cash,
    assetBefore = s.assetType;
  const cardId = selectedCard(s)?.cardId ?? null;
  let cashReserved = 0,
    cardRebalanceFee = 0;
  if (cardId) {
    s.cardUsageCounts[cardId]++;
  }
  if (
    cardId === 'rebalance' &&
    s.rebalanceTarget &&
    s.rebalanceTarget !== s.assetType
  ) {
    cardRebalanceFee = payCost(s, brokerFee(s));
    s.brokerFee += cardRebalanceFee;
    s.assetType = s.rebalanceTarget;
  }
  if (cardId === 'cashReserve') {
    cashReserved = money(s.investedAssets * K.cashReserveRatio);
    s.investedAssets -= cashReserved;
    s.cash += cashReserved;
  }
  if (cardId === 'dividend') s.dividendTurns += K.dividendDuration;
  const baseReturn = event.returns[s.assetType];
  // An already armed bonus applies once to the NEXT positive return of the equipped asset.
  const contrarianTriggered = s.contrarianPending && baseReturn > 0;
  const rate = adjustedReturn(baseReturn, cardId, contrarianTriggered);
  if (contrarianTriggered) s.contrarianPending = false;
  s.panicPenalty = false;
  let additional = 0;
  if (decision === 'hold') applyHold(s, rate);
  else if (decision === 'panic') applyPanicSell(s, rate);
  else
    additional = applyBuyMore(
      s,
      rate,
      cardId === 'dollarCost' ? K.dollarCostRatio : C.buyMoreCashRatio,
    );
  const dividend = applyDividend(s);
  const strategyDividend =
    s.dividendTurns > 0 ? money(s.investedAssets * K.dividendRate) : 0;
  s.cash += strategyDividend;
  if (s.dividendTurns > 0) s.dividendTurns--;
  const contrarianArmed =
    cardId === 'contrarian' &&
    decision === 'buyMore' &&
    ['crash', 'severe_crash'].includes(event.id);
  if (contrarianArmed) s.contrarianPending = true;
  const drawdown = updateDrawdown(s);
  s.decisionCounts[decision]++;
  s.assetUsageTurns[s.assetType]++;
  if (event.id === 'crash') s.crashCount++;
  if (event.id === 'severe_crash') s.severeCrashCount++;
  s.history.push({
    turn: s.turn,
    year: s.turn,
    assetType: s.assetType,
    marketEvent: event.id,
    decision,
    investedBefore,
    cashBefore,
    investedAfter: s.investedAssets,
    cashAfter: s.cash,
    totalAfter: totalAssets(s),
    drawdown,
    dividend,
    brokerFee: s.brokerFee,
    reentry: s.reentry,
    additional,
    cardId,
    assetBefore,
    baseReturn,
    effectiveReturn: rate,
    strategyDividend,
    cashReserved,
    contrarianTriggered,
    contrarianArmed,
    cardRebalanceFee,
    shopSpent: s.shopSpent,
  });
  discardHand(s);
  s.rebalanceTarget = null;
  s.previousMarketEvent = event.id;
  s.phase = checkGameOver(s)
    ? 'gameOver'
    : checkGameClear(s)
      ? 'clear'
      : 'turnResult';
}
export function cloneState(state: State): State {
  return {
    ...state,
    history: [...state.history],
    decisionCounts: { ...state.decisionCounts },
    assetUsageTurns: { ...state.assetUsageTurns },
    brokerVisits: [...state.brokerVisits],
    deck: [...state.deck],
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    hand: [...state.hand],
    cardUsageCounts: { ...state.cardUsageCounts },
    acquisitions: [...state.acquisitions],
    rewardChoices: [...state.rewardChoices],
    shopOffers: state.shopOffers.map((o) => ({ ...o })),
  };
}
// Preview shares settlement logic and never changes the live state or RNG streams.
export function previewDecision(state: State, decision: Decision) {
  const event = MARKET_EVENTS.find((e) => e.id === state.eventId);
  if (state.phase !== 'decision' || !event) return null;
  const preview = cloneState(state);
  applyDecision(preview, decision, event);
  return preview.history.at(-1)!;
}
export function assetHistoryPoints(s: State) {
  const points = [
    { year: 0, total: C.initialTotal },
    ...s.history.map((h) => ({ year: h.year, total: h.totalAfter })),
  ];
  // A shop payment can end a run before the current year's market is settled.
  if (s.phase === 'gameOver' && s.history.at(-1)?.turn !== s.turn)
    points.push({ year: s.turn, total: totalAssets(s) });
  return points;
}
export function calculateRank(total: number) {
  return RANKS.find((r) => total >= r.min)?.rank ?? 'F';
}
export function calculateTitles(s: State) {
  const clear = checkGameClear(s);
  const titles: string[] = [];
  if (clear && s.decisionCounts.panic === 0) titles.push('鋼の握力');
  if (
    s.history.filter(
      (h) =>
        ['crash', 'severe_crash'].includes(h.marketEvent) &&
        h.decision === 'buyMore',
    ).length >= 3
  )
    titles.push('暴落ハンター');
  if (clear && s.cash / totalAssets(s) <= 0.1)
    titles.push('フルインベストメント');
  if (s.maxDrawdown >= -0.15) titles.push('鉄壁の守護者');
  if (totalAssets(s) >= 3_000_000) titles.push('一攫千金');
  if (s.decisionCounts.panic >= 5) titles.push('狼狽王');
  if (checkGameOver(s) && s.turn <= 10) titles.push('退場芸人');
  if (clear && s.assetUsageTurns.gold >= 10) titles.push('金ピカ投資家');
  if (clear && s.assetUsageTurns.nasdaq >= 15) titles.push('NASDAQ信者');
  return titles.slice(0, 3);
}
export function reducer(state: State, action: Action): State {
  if (action.type === 'TITLE') return createGame(state.seed, state.debug);
  if (action.type === 'START') {
    if (!['title', 'clear', 'gameOver'].includes(state.phase)) return state;
    return { ...createGame(action.seed, action.debug), phase: 'select' };
  }
  // Every command is phase-guarded, so repeated clicks cannot settle a turn twice.
  const s = cloneState(state);
  if (
    action.type === 'SELECT_ASSET' &&
    s.phase === 'select' &&
    Object.hasOwn(ASSETS, action.assetId)
  ) {
    s.assetType = action.assetId;
    startTurn(s);
  } else if (
    action.type === 'BROKER' &&
    s.phase === 'broker' &&
    Object.hasOwn(ASSETS, action.assetId)
  )
    changeAsset(s, action.assetId);
  else if (
    action.type === 'SHOP_ASSET' &&
    s.phase === 'broker' &&
    Object.hasOwn(ASSETS, action.assetId) &&
    action.assetId !== s.assetType
  )
    changeAsset(s, action.assetId, false);
  else if (action.type === 'LEAVE_SHOP' && s.phase === 'broker') {
    drawHand(s);
    showForecast(s);
  } else if (action.type === 'SHOP_BUY' && s.phase === 'broker') {
    const offer = s.shopOffers.find(
      (o) => o.id === action.offerId && !o.purchased,
    );
    if (!offer || totalAssets(s) < CARDS[offer.cardId].price) return state;
    s.shopSpent += payCost(s, CARDS[offer.cardId].price);
    offer.purchased = true;
    addCard(s, offer.cardId, 'shop', s.turn);
  } else if (action.type === 'SHOP_REMOVE' && s.phase === 'broker') {
    if (
      !s.deck.some((c) => c.id === action.instanceId) ||
      totalAssets(s) < K.removalCost
    )
      return state;
    s.shopSpent += payCost(s, K.removalCost);
    removeCard(s, action.instanceId);
  } else if (action.type === 'SELECT_CARD' && s.phase === 'decision') {
    if (action.instanceId !== null && !s.hand.includes(action.instanceId))
      return state;
    s.selectedCardId = action.instanceId;
    s.rebalanceTarget = null;
  } else if (
    action.type === 'REBALANCE_TARGET' &&
    s.phase === 'decision' &&
    selectedCard(s)?.cardId === 'rebalance' &&
    Object.hasOwn(ASSETS, action.assetId)
  )
    s.rebalanceTarget = action.assetId;
  else if (action.type === 'REWARD' && s.phase === 'reward') {
    if (action.cardId !== null) {
      if (!s.rewardChoices.includes(action.cardId)) return state;
      addCard(s, action.cardId, 'reward', s.turn);
    }
    s.rewardChoices = [];
    s.turn++;
    startTurn(s);
  } else if (action.type === 'REVEAL' && s.phase === 'forecast')
    s.phase = 'decision';
  else if (
    action.type === 'DECIDE' &&
    s.phase === 'decision' &&
    ['panic', 'hold', 'buyMore'].includes(action.decision)
  ) {
    const event = MARKET_EVENTS.find((e) => e.id === s.eventId);
    if (event) applyDecision(s, action.decision, event);
  } else if (action.type === 'NEXT' && s.phase === 'turnResult') {
    if (s.turn % K.rewardInterval === 0) {
      s.rewardChoices = randomCardChoices(s);
      s.phase = 'reward';
    } else {
      s.turn++;
      startTurn(s);
    }
  } else if (
    action.type === 'FORCE_EVENT' &&
    s.debug &&
    s.phase === 'forecast' &&
    MARKET_EVENTS.some((e) => e.id === action.eventId)
  )
    s.eventId = action.eventId;
  else return state;
  if (checkGameOver(s)) {
    s.phase = 'gameOver';
    discardHand(s);
    s.rebalanceTarget = null;
  }
  return s;
}
