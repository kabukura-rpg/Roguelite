'use client';
import {
  ArrowRight,
  Check,
  Shield,
  Scissors,
  Zap,
  Coins,
  Wallet,
  Layers,
  Crosshair,
  Trash2,
  ShoppingBag,
  Gift,
  X,
  Clock,
} from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ASSETS, DECISIONS, type AssetId } from '@/lib/game/data';
import {
  CARDS,
  CARD_CONFIG,
  selectedCard,
  cardSummary,
  type CardId,
} from '@/lib/game/cards';
import {
  totalAssets,
  type State,
  type Action,
  type History,
} from '@/lib/game/engine';
const yen = (n: number) => n.toLocaleString('ja-JP');
const pct = (n: number) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const icons = {
  shield: Shield,
  scissors: Scissors,
  zap: Zap,
  coins: Coins,
  wallet: Wallet,
  layers: Layers,
  crosshair: Crosshair,
};
export function StrategyCard({
  cardId,
  selected = false,
  disabled = false,
  onClick,
  footer,
}: {
  cardId: CardId;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  footer: string;
}) {
  const card = CARDS[cardId],
    Icon = icons[card.icon];
  return (
    <button
      type="button"
      className={`strategy-card ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={card.description}
      aria-label={`${card.name}：${card.description} ${footer}`}
      style={{ '--card-color': card.color } as CSSProperties}
    >
      <div className="strategy-top">
        <span>{card.category}</span>
        {selected ? (
          <Check size={17} />
        ) : (
          <span className="strategy-mark">◇</span>
        )}
      </div>
      <div className="strategy-icon">
        <Icon size={34} strokeWidth={1.3} />
      </div>
      <h3>{card.name}</h3>
      <p>{card.summary}</p>
      <div className="strategy-footer">
        {footer}
        {selected ? <Check size={14} /> : <ArrowRight size={14} />}
      </div>
    </button>
  );
}
export function DeckBar({
  state,
  onOpen,
}: {
  state: State;
  onOpen: () => void;
}) {
  return (
    <div className="deck-bar">
      <Button variant="ghost" className="secondary-button" onClick={onOpen}>
        <Layers /> デッキ <b>{state.deck.length}</b>
      </Button>
      <span>
        山札 <b>{state.drawPile.length}</b>
      </span>
      <span>
        手札 <b>{state.hand.length}</b>
      </span>
      <span>
        捨て札 <b>{state.discardPile.length}</b>
      </span>
      <div className="active-effects">
        {state.dividendTurns > 0 && (
          <span>
            <Clock size={14} /> 配当金 残り{state.dividendTurns}年
          </span>
        )}
        {state.contrarianPending && (
          <span>
            <Crosshair size={14} /> 逆張り 上昇待ち ×1.3
          </span>
        )}
      </div>
    </div>
  );
}
export function HandPanel({
  state,
  commit,
  disabled = false,
  compact = false,
}: {
  state: State;
  commit: (action: Action) => unknown;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected = selectedCard(state);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <section
      className={`hand-panel ${compact ? 'compact-hand' : ''}`}
      aria-label="戦略カードの手札"
    >
      <div className="hand-heading">
        <h3>
          <span className="eyebrow gold">HAND</span> {state.hand.length}枚
        </h3>
        <span>
          {disabled ? (
            '予報を待っています'
          ) : (
            <>
              戦略 <b>{selected ? 1 : 0} / 1枚</b>
            </>
          )}
        </span>
      </div>
      <div className="hand-cards">
        {state.hand.map((id) => {
          const c = state.deck.find((c) => c.id === id)!;
          return (
            <StrategyCard
              key={id}
              cardId={c.cardId}
              selected={state.selectedCardId === id}
              disabled={disabled}
              onClick={() =>
                commit({
                  type: 'SELECT_CARD',
                  instanceId: state.selectedCardId === id ? null : id,
                })
              }
              footer={state.selectedCardId === id ? '使用予定' : 'STRATEGY'}
            />
          );
        })}
      </div>
      {state.hand.length === 0 && (
        <p className="empty-note">手札なし · カードを使わずに進めます。</p>
      )}
      <div className={`hand-selection ${selected ? 'has-strategy' : ''}`}>
        {selected ? (
          <>
            <span>
              <Check size={14} />
              <strong>{CARDS[selected.cardId].name}</strong>
            </span>
            <div>
              <Button variant="ghost" onClick={() => setDetailsOpen(true)}>
                詳細
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  commit({ type: 'SELECT_CARD', instanceId: null })
                }
                aria-label="カード選択を解除"
              >
                <X size={14} />
                解除
              </Button>
            </div>
          </>
        ) : (
          <span>
            {disabled
              ? '相場の気配を読み、手札を確かめよう。'
              : 'カードを使わずに相場へ進みます'}
          </span>
        )}
      </div>
      <Dialog open={detailsOpen && !!selected} onOpenChange={setDetailsOpen}>
        <DialogContent className="help-dialog card-detail-dialog">
          <DialogTitle>
            {selected ? CARDS[selected.cardId].name : '戦略カード'}
          </DialogTitle>
          <DialogDescription>
            {selected ? CARDS[selected.cardId].description : ''}
          </DialogDescription>
          <p>進行を確定するまで選び直せます。</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function DeckList({
  state,
  removal = false,
  commit,
}: {
  state: State;
  removal?: boolean;
  commit?: (action: Action) => unknown;
}) {
  return (
    <div className="deck-list">
      {state.deck.length === 0 ? (
        <p>デッキは空です。カードを使わずに進めます。</p>
      ) : (
        state.deck.map((instance, i) => {
          const card = CARDS[instance.cardId],
            Icon = icons[card.icon];
          return (
            <div className="deck-row" key={instance.id}>
              <span className="deck-index">
                {String(i + 1).padStart(2, '0')}
              </span>
              <Icon size={20} style={{ color: card.color }} />
              <div className="deck-row-copy">
                <strong>{card.name}</strong>
                <p>{card.summary}</p>
                <p className="deck-row-detail">{card.description}</p>
              </div>
              <span className="deck-zone">
                {state.hand.includes(instance.id)
                  ? '手札'
                  : state.drawPile.includes(instance.id)
                    ? '山札'
                    : '捨て札'}
              </span>
              {removal && (
                <Button
                  variant="outline"
                  className="remove-card-button"
                  disabled={totalAssets(state) < CARD_CONFIG.removalCost}
                  aria-label={`${card.name} ${i + 1}枚目を30,000円で削除`}
                  onClick={() =>
                    commit?.({ type: 'SHOP_REMOVE', instanceId: instance.id })
                  }
                >
                  <Trash2 size={14} />
                  削除
                </Button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
export function ShopCards({
  state,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  return (
    <div className="shop-strategies">
      <div className="section-line">
        <h3>
          <ShoppingBag size={20} /> 戦略カードを購入
        </h3>
        <span>今回の品ぞろえ · 各1枚</span>
      </div>
      <p>
        費用は現金を優先し、不足分は投資資産から支払います。獲得カードは捨て札に入り、次のシャッフルから登場します。
      </p>
      <div className="offer-cards">
        {state.shopOffers.map((o) => (
          <StrategyCard
            key={o.id}
            cardId={o.cardId}
            disabled={o.purchased || totalAssets(state) < CARDS[o.cardId].price}
            footer={
              o.purchased
                ? '購入済み'
                : totalAssets(state) < CARDS[o.cardId].price
                  ? '資産が足りません'
                  : `${yen(CARDS[o.cardId].price)}円で購入`
            }
            onClick={() => commit({ type: 'SHOP_BUY', offerId: o.id })}
          />
        ))}
      </div>
      <div className="section-line removal-heading">
        <h3>
          <Trash2 size={19} /> デッキを圧縮
        </h3>
        <span>1枚につき {yen(CARD_CONFIG.removalCost)}円</span>
      </div>
      <p>不要なカードを1枚削除します。削除はすぐに確定します。</p>
      <DeckList state={state} removal commit={commit} />
      <div className="shop-receipt">
        このショップでのカード購入・削除{' '}
        <strong>{yen(state.shopSpent)}円</strong>
      </div>
    </div>
  );
}
export function CardReward({
  state,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  return (
    <section className="panel reward-panel">
      <Gift size={32} strokeWidth={1.4} />
      <span className="eyebrow gold">YEAR {state.turn} / STRATEGY REWARD</span>
      <h2>新しい戦略を、旅の力に。</h2>
      <p>3つの戦略から1枚を獲得。スキップしてデッキを絞ることもできます。</p>
      <div className="offer-cards">
        {state.rewardChoices.map((id) => (
          <StrategyCard
            key={id}
            cardId={id}
            footer="この戦略を獲得"
            onClick={() => commit({ type: 'REWARD', cardId: id })}
          />
        ))}
      </div>
      <p className="reward-note">
        獲得カードは捨て札に追加され、次のシャッフルから登場します。
      </p>
      <Button
        variant="outline"
        className="secondary-button"
        onClick={() => commit({ type: 'REWARD', cardId: null })}
      >
        獲得せずに次の年へ <ArrowRight />
      </Button>
    </section>
  );
}
export function StrategyOutcome({ entry }: { entry: History }) {
  return (
    <div className="strategy-outcome">
      <div className="outcome-combo">
        <span>
          {entry.cardId ? CARDS[entry.cardId].name : 'カード使用なし'}
        </span>
        <b>＋</b>
        <span>
          {entry.resolution === 'strategy'
            ? '戦略による結果'
            : DECISIONS[entry.decision]}
        </span>
      </div>
      <div className="outcome-rate">
        <span>{ASSETS[entry.assetType].name}の相場リターン</span>
        <strong>
          {pct(entry.baseReturn)} <ArrowRight size={17} />{' '}
          <b className={entry.effectiveReturn >= 0 ? 'positive' : 'negative'}>
            {pct(entry.effectiveReturn)}
          </b>
        </strong>
      </div>
      {entry.cardId && <p>{CARDS[entry.cardId].description}</p>}
      {entry.cashReserved > 0 && (
        <p>相場の前に {yen(entry.cashReserved)}円を現金化。</p>
      )}
      {entry.additional > 0 && (
        <p>買い増しで {yen(entry.additional)}円を追加投資。</p>
      )}
      {entry.strategyDividend > 0 && (
        <p className="positive">
          戦略「配当金」から +{yen(entry.strategyDividend)}円。
        </p>
      )}
      {entry.contrarianTriggered && (
        <p className="positive">
          待機中の「逆張り」が発動。今回の上昇を1.3倍にしました。
        </p>
      )}
      {entry.contrarianArmed && (
        <p>「逆張り」が待機中。次に保有資産がプラスになる相場で発動します。</p>
      )}
      {entry.cardId === 'contrarian' && !entry.contrarianArmed && (
        <p>今回は「暴落系の相場で買い増し」の条件を満たしていません。</p>
      )}
      {entry.effectiveReturn < -1 && (
        <p>投資資産は0円が下限です。借金は発生しません。</p>
      )}
    </div>
  );
}
export function CardResult({ state }: { state: State }) {
  const stats = cardSummary(state);
  return (
    <div className="card-result">
      <div className="card-result-stats">
        <div>
          <span>使用カード回数</span>
          <strong>
            {stats.totalUsed}
            <small> 回</small>
          </strong>
        </div>
        <div>
          <span>最も使った戦略</span>
          <strong className="most-used">
            {stats.mostUsed.length
              ? stats.mostUsed.map(([id]) => CARDS[id].name).join('・')
              : '使用なし'}
          </strong>
          {stats.mostUsed.length > 0 && (
            <small>
              {stats.mostUsed[0][1]}回
              {stats.mostUsed.length > 1 ? 'ずつ（同率）' : ''}
            </small>
          )}
        </div>
        <div>
          <span>最終デッキ</span>
          <strong>
            {stats.deckSize}
            <small> 枚</small>
          </strong>
        </div>
      </div>
      <div className="acquired-cards">
        <span className="label">獲得した戦略</span>
        {state.acquisitions.length ? (
          <div>
            {(Object.keys(CARDS) as CardId[]).map((id) => {
              const records = state.acquisitions.filter((c) => c.cardId === id);
              return records.length ? (
                <span
                  key={id}
                  title={`報酬${records.filter((r) => r.source === 'reward').length}枚・購入${records.filter((r) => r.source === 'shop').length}枚・突発${records.filter((r) => r.source === 'incident').length}枚`}
                >
                  {CARDS[id].name} ×{records.length}
                </span>
              ) : null;
            })}
          </div>
        ) : (
          <p>追加獲得なし</p>
        )}
        <small>旅の途中で削除したカードも獲得記録に含みます。</small>
      </div>
    </div>
  );
}
