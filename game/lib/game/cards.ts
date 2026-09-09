export const CARD_CONFIG = {
  handSize: 5,
  rewardInterval: 3,
  offerCount: 3,
  removalCost: 30_000,
  diversificationFactor: 0.7,
  stopLossFloor: -0.25,
  stopLossCeiling: 0.14,
  leverageFactor: 2,
  dividendDuration: 3,
  dividendRate: 0.01,
  cashReserveRatio: 0.2,
  dollarCostRatio: 0.75,
  contrarianFactor: 1.3,
};
export const CARDS = {
  diversify: {
    name: '分散投資',
    category: '守備',
    icon: 'shield',
    color: '#91b9ed',
    summary: '下落を30%軽減',
    description: 'この年のマイナスリターンを30%軽減。プラス相場では効果なし。',
    price: 50_000,
  },
  stopLoss: {
    name: '損切り',
    category: '守備',
    icon: 'scissors',
    color: '#91b9ed',
    summary: '損失 −25% / 利益 +14%まで',
    description:
      'この年の相場による損失は最大−25%、利益も最大+14%に制限。大きな上昇を取り逃す代わりに、大きな下落を抑えます。配当・現金・手数料は対象外。',
    price: 60_000,
  },
  leverage: {
    name: 'レバレッジ',
    category: '攻勢',
    icon: 'zap',
    color: '#eda391',
    summary: '利益・損失 ×2',
    description: 'この年の相場リターンを2倍。大きな利益にも、大きな損失にも。',
    price: 70_000,
  },
  dividend: {
    name: '配当金',
    category: '継続',
    icon: 'coins',
    color: '#87cdb4',
    summary: '配当1% × 3年',
    description:
      '使用年を含む3年間、年末の投資資産の1%を現金で獲得。再使用は期間を3年延長。',
    price: 60_000,
  },
  cashReserve: {
    name: '現金確保',
    category: '準備',
    icon: 'wallet',
    color: '#dab77c',
    summary: '投資額20%を現金化',
    description:
      '相場リターンの前に、投資資産の20%を現金に移す。下落の影響を減らす一方、上昇時の利益も減ります。',
    price: 40_000,
  },
  dollarCost: {
    name: 'ドルコスト平均法',
    category: '攻勢',
    icon: 'layers',
    color: '#eda391',
    summary: '現金75%を投入',
    description:
      'このカードだけで、相場リターンの前に現金の75%を追加投資する。上昇時の利益も下落時の損失も増えます。現金がなくても使用できます。',
    price: 50_000,
  },
  contrarian: {
    name: '逆張り',
    category: '布石',
    icon: 'crosshair',
    color: '#baa5ed',
    summary: '現金50%投入・逆張り',
    description:
      '相場の前に現金50%を追加投資。暴落・歴史的大暴落なら、次に保有資産がプラスになる相場を1.3倍。倍率は重複しない。',
    price: 70_000,
  },
} as const;
export type CardId = keyof typeof CARDS;
export const INITIAL_DECK: CardId[] = [
  'diversify',
  'diversify',
  'stopLoss',
  'stopLoss',
  'cashReserve',
  'cashReserve',
  'dollarCost',
  'dollarCost',
  'dividend',
  'leverage',
];
export type CardInstance = { id: string; cardId: CardId };
export type Acquisition = {
  cardId: CardId;
  source: 'reward' | 'shop' | 'incident';
  turn: number;
};
export type DeckState = {
  deck: CardInstance[];
  drawPile: string[];
  discardPile: string[];
  hand: string[];
  selectedCardId: string | null;
  nextCardId: number;
  cardRng: number;
  dividendTurns: number;
  contrarianPending: boolean;
  cardUsageCounts: Record<CardId, number>;
  acquisitions: Acquisition[];
  rewardChoices: CardId[];
  shopOffers: { id: string; cardId: CardId; purchased: boolean }[];
};
function cardRandom(s: DeckState) {
  s.cardRng = (s.cardRng + 0x6d2b79f5) >>> 0;
  let t = s.cardRng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function shuffle<T>(items: readonly T[], s: DeckState): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(cardRandom(s) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createDeck(seed: number): DeckState {
  const s: DeckState = {
    deck: INITIAL_DECK.map((cardId, i) => ({ id: `card-${i + 1}`, cardId })),
    drawPile: [],
    discardPile: [],
    hand: [],
    selectedCardId: null,
    nextCardId: 11,
    cardRng: (seed ^ 0xa5b35705) >>> 0,
    dividendTurns: 0,
    contrarianPending: false,
    cardUsageCounts: Object.fromEntries(
      Object.keys(CARDS).map((id) => [id, 0]),
    ) as Record<CardId, number>,
    acquisitions: [],
    rewardChoices: [],
    shopOffers: [],
  };
  s.drawPile = shuffle(
    s.deck.map((c) => c.id),
    s,
  );
  return s;
}
export function drawHand(s: DeckState) {
  while (s.hand.length < CARD_CONFIG.handSize) {
    if (!s.drawPile.length) {
      if (!s.discardPile.length) break;
      s.drawPile = shuffle(s.discardPile, s);
      s.discardPile = [];
    }
    s.hand.push(s.drawPile.pop()!);
  }
}
export function discardHand(s: DeckState) {
  s.discardPile.push(...s.hand);
  s.hand = [];
  s.selectedCardId = null;
}
export function selectedCard(s: DeckState) {
  return s.hand.includes(s.selectedCardId ?? '')
    ? s.deck.find((c) => c.id === s.selectedCardId)
    : undefined;
}
export function addCard(
  s: DeckState,
  cardId: CardId,
  source: Acquisition['source'],
  turn: number,
) {
  const card = { id: `card-${s.nextCardId++}`, cardId };
  s.deck.push(card);
  s.discardPile.push(card.id);
  s.acquisitions.push({ cardId, source, turn });
}
export function removeCard(s: DeckState, id: string) {
  s.deck = s.deck.filter((c) => c.id !== id);
  s.drawPile = s.drawPile.filter((c) => c !== id);
  s.discardPile = s.discardPile.filter((c) => c !== id);
  s.hand = s.hand.filter((c) => c !== id);
  if (s.selectedCardId === id) s.selectedCardId = null;
}
export function randomCardChoices(s: DeckState): CardId[] {
  return shuffle(Object.keys(CARDS) as CardId[], s).slice(
    0,
    CARD_CONFIG.offerCount,
  );
}
export function cardSummary(s: DeckState) {
  const entries = Object.entries(s.cardUsageCounts) as [CardId, number][];
  const mostUsed = entries
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  return {
    totalUsed: entries.reduce((n, [, count]) => n + count, 0),
    mostUsed: mostUsed.filter(([, count]) => count === mostUsed[0]?.[1]),
    deckSize: s.deck.length,
  };
}
