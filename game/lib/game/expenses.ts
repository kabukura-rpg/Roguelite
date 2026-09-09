import { lifeExpense, type PolicyId, type Allocation } from './portfolio.ts';

export const EXPENSE_CONFIG = {
  ranges: [
    [50_000, 120_000],
    [80_000, 180_000],
    [120_000, 250_000],
    [150_000, 350_000],
  ] as const,
  referenceAssets: 1_000_000,
  assetAdjustment: 0.1,
  maxAdjustment: 0.2,
  taxRate: 0.08,
  taxMin: 80_000,
  taxMax: 300_000,
  taxWeight: 0.2,
};
export type ExpenseQuote = {
  eventId: string;
  turn: number;
  model: 'year' | 'tax' | 'legacy';
  baseAmount: number;
  assetFactor: number;
  amount: number;
};
export type ExpenseState = {
  expenseRng: number;
  currentExpense: ExpenseQuote | null;
};
export function createExpenses(seed: number): ExpenseState {
  return { expenseRng: (seed ^ 0x93ab67d1) >>> 0, currentExpense: null };
}
export function expenseRandom(s: ExpenseState) {
  s.expenseRng = (s.expenseRng + 0x6d2b79f5) >>> 0;
  let t = s.expenseRng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function expenseRange(turn: number) {
  return EXPENSE_CONFIG.ranges[
    Math.max(0, Math.min(3, Math.floor((turn - 1) / 5)))
  ];
}
export function expenseAssetFactor(total: number) {
  const c = EXPENSE_CONFIG;
  return (
    1 +
    Math.max(
      -c.maxAdjustment,
      Math.min(
        c.maxAdjustment,
        Math.log2(Math.max(1, total) / c.referenceAssets) * c.assetAdjustment,
      ),
    )
  );
}
// No cash-balance input: identical total assets and draw produce the same bill.
export function quoteExpense(
  eventId: string,
  turn: number,
  total: number,
  draw: number,
): ExpenseQuote {
  if (eventId === 'tax') {
    const amount = Math.round(
      Math.max(
        EXPENSE_CONFIG.taxMin,
        Math.min(EXPENSE_CONFIG.taxMax, total * EXPENSE_CONFIG.taxRate),
      ),
    );
    return {
      eventId,
      turn,
      model: 'tax',
      baseAmount: amount,
      assetFactor: 1,
      amount,
    };
  }
  const [low, high] = expenseRange(turn);
  const baseAmount = Math.min(
    high,
    low + Math.floor(Math.max(0, Math.min(1, draw)) * (high - low + 1)),
  );
  const assetFactor = expenseAssetFactor(total);
  return {
    eventId,
    turn,
    model: 'year',
    baseAmount,
    assetFactor,
    amount: Math.round(baseAmount * assetFactor),
  };
}
export function currentExpenseQuote(
  s: { currentExpense?: ExpenseQuote | null; turn: number },
  event: { id: string; cost?: number },
): ExpenseQuote {
  if (
    s.currentExpense?.eventId === event.id &&
    s.currentExpense.turn === s.turn
  )
    return s.currentExpense;
  // An old save already showing an invoice keeps the original fixed bill.
  const amount = event.cost ?? EXPENSE_CONFIG.taxMin;
  return {
    eventId: event.id,
    turn: s.turn,
    model: 'legacy',
    baseAmount: amount,
    assetFactor: 1,
    amount,
  };
}
export function expensePayment(
  cash: number,
  invested: number,
  quote: ExpenseQuote,
  policies: readonly PolicyId[] = [],
) {
  const required = lifeExpense(quote.amount, policies);
  const cashPaid = Math.min(cash, required);
  const shortage = required - cashPaid;
  const forcedSale = Math.min(invested, shortage);
  return {
    required,
    cashPaid,
    shortage,
    forcedSale,
    unpaid: shortage - forcedSale,
    cashAfter: cash - cashPaid,
    investedAfter: invested - forcedSale,
  };
}
export type ExpenseRecord = {
  expense?: ExpenseQuote;
  requiredCost?: number;
  soldAllocation?: Allocation[];
};
