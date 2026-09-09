import {
  generateForecast,
  selectActualMarketEvent,
  calculateMarketReturn,
  FORECAST_CONFIG,
  type Forecast,
} from './forecast.ts';
export { getAdjustedEventWeights } from './forecast.ts';
import {
  INCIDENTS,
  createIncidents,
  drawIncident,
  incidentRandom,
  type IncidentState,
} from './incidents.ts';
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
  | 'turnResult'
  | 'incident'
  | 'incidentResult'
  | 'reward'
  | 'clear'
  | 'gameOver';
export type History = {
  resolution: 'strategy' | 'event';
  forecast: Forecast | null;
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
  shopSpent: number;
};
export type State = DeckState &
  IncidentState & {
    phase: Phase;
    turn: number;
    investedAssets: number;
    cash: number;
    assetType: AssetId;
    peakAssets: number;
    maxDrawdown: number;
    previousMarketEvent: string | null;
    panicReentryPending: boolean;
    turnsSinceBroker: number;
    history: History[];
    decisionCounts: Record<Decision, number>;
    crashCount: number;
    severeCrashCount: number;
    assetUsageTurns: Record<AssetId, number>;
    seed: number;
    rng: number;
    eventId: string | null;
    forecast: Forecast | null;
    forecastRng: number;
    marketRng: number;
    forcedEventId: string | null;
    reentry: number;
    brokerVisits: number[];
    debug: boolean;
    shopSpent: number;
  };
export type Action =
  | { type: 'START'; seed: number; debug?: boolean }
  | { type: 'SELECT_ASSET'; assetId: AssetId }
  | { type: 'SELECT_CARD'; instanceId: string | null }
  | { type: 'REWARD'; cardId: CardId | null }
  | { type: 'SHOP_BUY'; offerId: string }
  | { type: 'SHOP_REMOVE'; instanceId: string }
  | { type: 'LEAVE_SHOP' }
  | { type: 'RESOLVE' }
  | { type: 'INCIDENT_CHOICE'; choiceId: string }
  | { type: 'INCIDENT_NEXT' }
  | { type: 'NEXT' }
  | { type: 'TITLE' }
  | { type: 'FORCE_EVENT'; eventId: string };
export const totalAssets = (s: Pick<State, 'investedAssets' | 'cash'>) =>
  s.investedAssets + s.cash;
export const money = (n: number) => Math.max(0, Math.round(n));
export function createGame(seed = 1, debug = false): State {
  return {
    ...createDeck(seed),
    ...createIncidents(seed),
    shopSpent: 0,
    phase: 'title',
    turn: 1,
    investedAssets: C.initialInvested,
    cash: C.initialCash,
    assetType: 'allWorld',
    peakAssets: C.initialTotal,
    maxDrawdown: 0,
    previousMarketEvent: null,
    panicReentryPending: false,
    turnsSinceBroker: 0,
    history: [],
    decisionCounts: { panic: 0, hold: 0, buyMore: 0 },
    crashCount: 0,
    severeCrashCount: 0,
    assetUsageTurns: {
      allWorld: 0,
      sp500: 0,
      nasdaq: 0,
      dividend: 0,
      gold: 0,
      bonds: 0,
    },
    seed: seed >>> 0,
    rng: seed >>> 0,
    eventId: null,
    forecast: null,
    forecastRng: (seed ^ 0x9137aab1) >>> 0,
    marketRng: (seed ^ 0x52e9143f) >>> 0,
    forcedEventId: null,
    reentry: 0,
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
function marketRandom(s: State, stream: 'forecastRng' | 'marketRng') {
  s[stream] = (s[stream] + 0x6d2b79f5) >>> 0;
  let t = s[stream];
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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
  s.eventId = null;
  s.forcedEventId = null;
  s.forecast = generateForecast(
    marketRandom(s, 'forecastRng'),
    s.history,
    s.forecastInsight ? FORECAST_CONFIG.insightBonus : 0,
  );
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
  s.eventId = null;
  s.forecast = null;
  s.forcedEventId = null;
  s.shopSpent = 0;
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

  if (cardId === 'leverage') rate *= K.leverageFactor;
  if (contrarian && base > 0) rate *= K.contrarianFactor;
  if (cardId === 'stopLoss')
    rate = Math.min(K.stopLossCeiling, Math.max(K.stopLossFloor, rate));
  return Math.max(-1, rate);
}
export function applyDecision(
  s: State,
  decision: Decision,
  event: MarketEvent,
  resolution: History['resolution'] = 'event',
) {
  const investedBefore = s.investedAssets,
    cashBefore = s.cash,
    assetBefore = s.assetType;
  const cardId = selectedCard(s)?.cardId ?? null;
  let cashReserved = 0;
  if (cardId) {
    s.cardUsageCounts[cardId]++;
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
  let rate = adjustedReturn(baseReturn, cardId, contrarianTriggered);
  if (resolution === 'strategy') {
    if (s.nextLossShield && rate < 0) rate *= 0.5;
    s.nextLossShield = false;
    s.forecastInsight = false;
  }
  if (contrarianTriggered) s.contrarianPending = false;
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
    resolution,
    forecast: s.forecast ? { ...s.forecast } : null,
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
    shopSpent: s.shopSpent,
  });
  discardHand(s);
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
    incidentHistory: [...state.incidentHistory],
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
export function assetHistoryPoints(s: State) {
  // A year-end incident is plotted just after its market so the line never doubles back.
  const points = [
    { year: 0, total: C.initialTotal, label: '開始' },
    ...s.history.flatMap((h) => [
      { year: h.year, total: h.totalAfter, label: `${h.year}年目の相場` },
      ...s.incidentHistory
        .filter((e) => e.turn === h.year)
        .map((e) => ({
          year: e.turn + 0.5,
          total: e.totalAfter,
          label: `${e.turn}年目の出来事`,
        })),
    ]),
  ];
  // A shop payment can end a run before the current year's market is settled.
  if (s.phase === 'gameOver' && s.history.at(-1)?.turn !== s.turn)
    points.push({ year: s.turn, total: totalAssets(s), label: `${s.turn}年目` });
  return points;
}
export function calculateRank(total: number) {
  return RANKS.find((r) => total >= r.min)?.rank ?? 'F';
}
// Higher rarity wins the three visible slots, so a common title never hides a rare one.
export const TITLES: { name: string; rarity: number; earned: (s: State) => boolean }[] =
  [
    {
      name: '一攫千金',
      rarity: 100,
      earned: (s) => totalAssets(s) >= C.targetAssets,
    },
    {
      name: 'NASDAQ信者',
      rarity: 80,
      earned: (s) => checkGameClear(s) && s.assetUsageTurns.nasdaq >= 15,
    },
    {
      name: '暴落ハンター',
      rarity: 75,
      earned: (s) =>
        s.history.filter(
          (h) =>
            ['crash', 'severe_crash'].includes(h.marketEvent) &&
            h.decision === 'buyMore',
        ).length >= 3,
    },
    {
      name: '金ピカ投資家',
      rarity: 60,
      earned: (s) => checkGameClear(s) && s.assetUsageTurns.gold >= 10,
    },
    {
      name: '鋼の握力',
      rarity: 55,
      earned: (s) => checkGameClear(s) && s.decisionCounts.panic === 0,
    },
    {
      name: '狼狽王',
      rarity: 50,
      earned: (s) => s.decisionCounts.panic >= 8,
    },
    {
      name: '鉄壁の守護者',
      rarity: 45,
      earned: (s) => s.maxDrawdown >= -0.15,
    },
    {
      name: '退場芸人',
      rarity: 40,
      earned: (s) => checkGameOver(s) && s.turn <= 10,
    },
    {
      name: 'フルインベストメント',
      rarity: 20,
      earned: (s) => checkGameClear(s) && s.cash / totalAssets(s) <= 0.1,
    },
  ];
export function calculateTitles(s: State) {
  return TITLES.filter((t) => t.earned(s))
    .sort((a, b) => b.rarity - a.rarity)
    .slice(0, 3)
    .map((t) => t.name);
}
function finishYear(s: State) {
  s.currentIncident = null;
  if (checkGameOver(s)) s.phase = 'gameOver';
  else if (s.turn >= C.totalTurns) s.phase = 'clear';
  else if (s.turn % K.rewardInterval === 0) {
    s.rewardChoices = randomCardChoices(s);
    s.phase = 'reward';
  } else {
    s.turn++;
    startTurn(s);
  }
}
export function resolveIncident(s: State, choiceId: string): boolean {
  const event = INCIDENTS.find((e) => e.id === s.currentIncident);
  if (
    s.phase !== 'incident' ||
    !event ||
    s.incidentHistory.some((h) => h.id === event.id)
  )
    return false;
  const choice = event.choices?.find((c) => c.id === choiceId);
  if (
    event.kind === 'shock' &&
    !['panic', 'hold', 'buyMore'].includes(choiceId)
  )
    return false;
  if (event.kind === 'life' && choiceId !== 'pay') return false;
  if (event.kind === 'chance' && (!choice || s.cash < (choice.cost ?? 0)))
    return false;
  const cashBefore = s.cash,
    investedBefore = s.investedAssets;
  let cost = 0,
    forcedSale = 0,
    rate: number | null = null,
    message = '';
  if (event.kind === 'life') {
    cost = Math.min(totalAssets(s), event.cost!);
    forcedSale = Math.max(0, cost - s.cash);
    payCost(s, event.cost!);
    message =
      cost < event.cost!
        ? '支払える資産をすべて充てました。資産が尽き、冒険は終了です。'
        : forcedSale
          ? '現金だけでは足りず、不足分の投資資産を強制売却しました。'
          : '手元の現金で支払い、投資資産を売らずに済みました。';
  } else if (event.kind === 'shock') {
    const [low, high] = event.range!;
    const sensitivity = {
      allWorld: 0.9,
      sp500: 1,
      nasdaq: 1.3,
      dividend: 0.8,
      gold: 0.55,
      bonds: 0.4,
    }[s.assetType];
    rate =
      Math.round(
        (low + incidentRandom(s) * (high - low)) * sensitivity * 1000,
      ) / 1000;
    if (choiceId === 'panic') {
      const sold = money(s.investedAssets * C.panicCashoutRatio);
      s.investedAssets -= sold;
      s.cash += sold;
      s.panicReentryPending = true;
    } else if (choiceId === 'buyMore') {
      const additional = money(s.cash * C.buyMoreCashRatio);
      s.cash -= additional;
      s.investedAssets += additional;
    }
    applyMarketReturn(s, rate);
    s.decisionCounts[choiceId as Decision]++;
    message =
      choiceId === 'panic'
        ? '急変が確定する前に90%を現金化。翌年、現金の30%を自動再投資します。'
        : choiceId === 'buyMore'
          ? '現金の50%を追加投資してから、市場ショックを受けました。'
          : '資産配分を維持して、市場ショックを受けました。';
  } else if (choice) {
    cost = choice.cost ?? 0;
    s.cash -= cost;
    if (choice.gamble) {
      const success = incidentRandom(s) < 1 / 3;
      if (success) s.cash += 40000;
      message = success
        ? '今回は4万円を受け取りました。毎回成功する保証はありません。'
        : '話は実現せず、参加費2万円を失いました。';
    } else {
      s.cash += choice.gain ?? 0;
      message = choice.hint;
    }
    if (choice.card) addCard(s, choice.card, 'incident', s.turn);
    if (choice.insight) s.forecastInsight = true;
    if (choice.shield) s.nextLossShield = true;
  }
  updateDrawdown(s);
  s.incidentHistory.push({
    id: event.id,
    turn: s.turn,
    choice:
      choice?.label ??
      (event.kind === 'life'
        ? '必要経費を支払う'
        : { panic: '狼狽売り', hold: 'ホールド', buyMore: '買い増し' }[
            choiceId as Decision
          ]),
    message,
    cashBefore,
    investedBefore,
    cashAfter: s.cash,
    investedAfter: s.investedAssets,
    totalAfter: totalAssets(s),
    cost,
    forcedSale,
    rate,
    card: choice?.card ?? null,
    insight: choice?.insight ?? false,
    shield: choice?.shield ?? false,
  });
  s.phase = 'incidentResult';
  return true;
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
  } else if (action.type === 'LEAVE_SHOP' && s.phase === 'broker') {
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
  } else if (action.type === 'SELECT_CARD' && s.phase === 'forecast') {
    if (action.instanceId !== null && !s.hand.includes(action.instanceId))
      return state;
    s.selectedCardId = action.instanceId;
  } else if (action.type === 'REWARD' && s.phase === 'reward') {
    if (action.cardId !== null) {
      if (!s.rewardChoices.includes(action.cardId)) return state;
      addCard(s, action.cardId, 'reward', s.turn);
    }
    s.rewardChoices = [];
    s.turn++;
    startTurn(s);
  } else if (
    action.type === 'RESOLVE' &&
    s.phase === 'forecast' &&
    s.forecast
  ) {
    const drawnId = selectActualMarketEvent(
      s.forecast,
      marketRandom(s, 'marketRng'),
      s.history,
    );
    s.eventId = s.debug && s.forcedEventId ? s.forcedEventId : drawnId;
    const definition = MARKET_EVENTS.find((e) => e.id === s.eventId)!;
    const event = {
      ...definition,
      returns: calculateMarketReturn(definition, marketRandom(s, 'marketRng')),
    };
    s.forcedEventId = null;
    // Normal years are settled by the chosen card alone; the three commands
    // belong to market-shock incidents.
    const card = selectedCard(s)?.cardId;
    const decision =
      card === 'dollarCost' || card === 'contrarian' ? 'buyMore' : 'hold';
    applyDecision(s, decision, event, 'strategy');
    // Always show this committed outcome, including a bankruptcy or the final year.
    s.phase = 'turnResult';
  } else if (action.type === 'NEXT' && s.phase === 'turnResult') {
    if (
      !checkGameOver(s) &&
      s.history.at(-1)?.resolution === 'strategy' &&
      drawIncident(s, s.turn)
    )
      s.phase = 'incident';
    else finishYear(s);
  } else if (action.type === 'INCIDENT_CHOICE' && s.phase === 'incident') {
    if (!resolveIncident(s, action.choiceId)) return state;
  } else if (action.type === 'INCIDENT_NEXT' && s.phase === 'incidentResult') {
    finishYear(s);
  } else if (
    action.type === 'FORCE_EVENT' &&
    s.debug &&
    s.phase === 'forecast' &&
    MARKET_EVENTS.some((e) => e.id === action.eventId)
  )
    s.forcedEventId = action.eventId;
  else return state;
  if (checkGameOver(s) && !['incidentResult', 'turnResult'].includes(s.phase)) {
    s.phase = 'gameOver';
    discardHand(s);
  }
  return s;
}
