'use client';
import { useState } from 'react';
import {
  Compass,
  Coins,
  Wallet,
  Shield,
  Sparkles,
  Gem,
  Flag,
  CloudFog,
  CloudLightning,
  Flame,
  Wind,
  TrendingUp,
  TrendingDown,
  Landmark,
  Layers,
  BookOpen,
  History as HistoryIcon,
  ArrowRight,
  Eye,
  Clock,
  Crosshair,
  Gift,
  Check,
  Info,
  Bug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ASSETS,
  MARKET_EVENTS,
  DECISIONS,
  GAME_CONFIG,
  type AssetId,
} from '@/lib/game/data';
import { CARDS, CARD_CONFIG, selectedCard } from '@/lib/game/cards';
import {
  totalAssets,
  brokerFee,
  type State,
  type Action,
} from '@/lib/game/engine';
import { HandPanel, StrategyCard, DeckList, StrategyOutcome } from './strategy';
import { IncidentBoard } from './incidents';
const yen = (n: number) => Math.round(n).toLocaleString('ja-JP');
const pct = (n: number) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const equipmentIcons = {
  sp500: Compass,
  nasdaq: Sparkles,
  dividend: Coins,
  gold: Gem,
  bonds: Shield,
};
export function GameHUD({ state: s }: { state: State }) {
  const Equipment = equipmentIcons[s.assetType];
  const goalProgress = Math.min(
    GAME_CONFIG.targetAssets,
    Math.max(0, totalAssets(s)),
  );
  const goalPercent = Math.round(
    (goalProgress / GAME_CONFIG.targetAssets) * 100,
  );
  return (
    <header className="game-hud" aria-label="ゲームのステータス">
      <div className="hud-total">
        <Coins />
        <div>
          <span>総資産</span>
          <strong>
            {yen(totalAssets(s))}
            <small> 円</small>
          </strong>
          <div className="hud-goal">
            <div>
              <span>目標 {yen(GAME_CONFIG.targetAssets)}円</span>
              <small>{goalPercent}%</small>
            </div>
            <progress
              aria-label="目標資産への進捗"
              max={GAME_CONFIG.targetAssets}
              value={goalProgress}
            />
          </div>
        </div>
      </div>
      <div>
        <Wallet />
        <div>
          <span>現金</span>
          <strong>
            {yen(s.cash)}
            <small> 円</small>
          </strong>
        </div>
      </div>
      <div className="hud-equipment">
        <Equipment style={{ color: ASSETS[s.assetType].color }} />
        <div>
          <span>
            現在の資産 <small>投資 {yen(s.investedAssets)}円</small>
          </span>
          <strong>{ASSETS[s.assetType].name}</strong>
        </div>
      </div>
      <div className="hud-year">
        <Flag />
        <div>
          <span>YEAR</span>
          <strong>
            {String(s.turn).padStart(2, '0')}{' '}
            <small>/ {GAME_CONFIG.totalTurns}年</small>
          </strong>
        </div>
      </div>
    </header>
  );
}
export function GameTools({
  state: s,
  onDeck,
  onHistory,
  onHelp,
  onDebug,
}: {
  state: State;
  onDeck: () => void;
  onHistory: () => void;
  onHelp: () => void;
  onDebug: () => void;
}) {
  return (
    <nav className="board-tools" aria-label="ゲームメニュー">
      <span className="board-brand">
        <Compass size={18} />
        株クラ
      </span>
      <Button variant="ghost" onClick={onDeck}>
        <Layers /> デッキ <b>{s.deck.length}</b>
      </Button>
      <span className="pile-counts">
        山札 {s.drawPile.length} <i /> 捨て札 {s.discardPile.length}
      </span>
      <div className="board-tools-end">
        <Button variant="ghost" onClick={onHistory}>
          <HistoryIcon />
          <span>記録・資産推移</span>
        </Button>
        <Button variant="ghost" onClick={onHelp}>
          <BookOpen />
          <span>遊び方</span>
        </Button>
        {s.debug && (
          <Button variant="ghost" aria-label="デバッグ" onClick={onDebug}>
            <Bug />
          </Button>
        )}
      </div>
    </nav>
  );
}
function Effects({ state: s }: { state: State }) {
  return (
    <div className="arena-effects">
      {s.nextLossShield && <span>冷静な判断 · 次の通常相場の下落半減</span>}
      {s.forecastInsight && <span>次の予報を詳しく確認</span>}
      {s.dividendTurns > 0 && (
        <span>
          <Clock size={13} />
          配当金 残り{s.dividendTurns}年
        </span>
      )}
      {s.contrarianPending && (
        <span>
          <Crosshair size={13} />
          逆張り ×1.3 待機
        </span>
      )}
    </div>
  );
}
function Encounter({
  state: s,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  const e = MARKET_EVENTS.find((e) => e.id === s.eventId)!;
  const revealed = s.phase === 'decision';
  const risk =
    e.forecast.find(([label]) => label === 'リスク')?.[1] ?? '変動に注意';
  const Icon = !revealed
    ? CloudFog
    : e.category === '暴落'
      ? CloudLightning
      : e.id === 'bubble'
        ? Flame
        : e.id === 'rate_hike' || e.id === 'inflation'
          ? Wind
          : e.category !== '下落'
            ? TrendingUp
            : TrendingDown;
  const notes = [
    s.reentry > 0 ? `${yen(s.reentry)}円を自動再投資` : null,
    s.brokerFee > 0 ? `装備変更 ${yen(s.brokerFee)}円` : null,
    s.shopSpent > 0 ? `ショップ ${yen(s.shopSpent)}円` : null,
  ].filter(Boolean);
  return (
    <section
      className={`battle-arena ${!revealed ? 'is-forecast' : 'is-uncertain'}`}
      aria-label={revealed ? '相場との対峙' : '市場予報'}
    >
      <div className="arena-topline">
        <span className="arena-tag">
          {revealed ? `ENCOUNTER · ${e.category}` : 'MARKET FORECAST'}
        </span>
        <Effects state={s} />
      </div>
      <div className="encounter-center">
        <div className="enemy-sigil" aria-hidden="true">
          <Icon strokeWidth={1} />
        </div>
        <div className="enemy-copy">
          <span className="enemy-overline">
            {revealed ? '立ちはだかる相場' : '次の相場の気配'}
          </span>
          <h2>{revealed ? e.name : 'まだ見ぬ市場'}</h2>
          {revealed ? (
            <p>{e.description}</p>
          ) : (
            <div className="forecast-signals">
              {e.forecast.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
              {s.forecastInsight &&
                Object.values(ASSETS).map((asset) => (
                  <div key={asset.id}>
                    <span>{asset.name}</span>
                    <strong>
                      {e.returns[asset.id] > 0
                        ? '上向きの見通し'
                        : e.returns[asset.id] < 0
                          ? '下向きの見通し'
                          : '横ばいの見通し'}
                    </strong>
                  </div>
                ))}
            </div>
          )}
        </div>
        {revealed ? (
          <div className="enemy-intent uncertain-intent">
            <span>市場リスク</span>
            <strong>{risk}</strong>
            <small>騰落率は結果で判明</small>
          </div>
        ) : (
          <Button
            className="primary reveal-button"
            onClick={() => commit({ type: 'REVEAL' })}
          >
            <Eye /> 相場を公開 <ArrowRight />
          </Button>
        )}
      </div>
      <div className="arena-bottomline">
        {revealed ? (
          <span>戦略を0〜1枚選択。結果を見届けよう。</span>
        ) : notes.length ? (
          <span>{notes.join(' / ')}</span>
        ) : (
          <span>予報を読んだら、相場を公開して戦略を選ぼう。</span>
        )}
      </div>
    </section>
  );
}
function StrategyCommit({
  state: s,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  const ready = s.phase === 'decision';
  const selected = selectedCard(s);
  return (
    <section className="strategy-commit" aria-label="戦略を確定">
      <span className="eyebrow gold">RESOLVE</span>
      <strong>
        {selected ? CARDS[selected.cardId].name : 'カードを使わない'}
      </strong>
      <p>
        {selected
          ? CARDS[selected.cardId].summary
          : 'カードを使わずに相場へ進みます'}
      </p>
      <Button
        className="primary"
        disabled={!ready}
        onClick={() => commit({ type: 'RESOLVE' })}
      >
        {ready
          ? selected
            ? 'カードを使う'
            : 'このまま進む'
          : '相場公開を待つ'}{' '}
        <ArrowRight />
      </Button>
      <small>確定するまで選び直せます</small>
    </section>
  );
}
function YearResult({
  state: s,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  const [details, setDetails] = useState(false);
  const h = s.history.at(-1)!;
  const event = MARKET_EVENTS.find((e) => e.id === h.marketEvent)!;
  const delta = h.totalAfter - h.investedBefore - h.cashBefore;
  const positive = delta >= 0;
  return (
    <section className="year-result-board">
      <span className="eyebrow gold">
        RESULT · YEAR {String(s.turn).padStart(2, '0')}
      </span>
      <div className={`result-insignia ${positive ? 'positive' : 'negative'}`}>
        {positive ? <TrendingUp /> : <TrendingDown />}
      </div>
      <h2>{event.name}</h2>
      <div className="resolved-combo">
        <span>使用戦略 · {h.cardId ? CARDS[h.cardId].name : 'カードなし'}</span>
        {h.resolution === 'event' && <span>{DECISIONS[h.decision]}</span>}
      </div>
      <strong
        className={`resolved-delta ${positive ? 'positive' : 'negative'}`}
      >
        {delta > 0 ? '+' : ''}
        {yen(delta)}
        <small>円</small>
      </strong>
      <p className="resolved-rate">
        {ASSETS[h.assetType].name} · 相場 {pct(h.baseReturn)}{' '}
        <ArrowRight size={15} /> 適用 {pct(h.effectiveReturn)}
      </p>
      <div className="result-total-change">
        <span>総資産</span>
        <strong>
          {yen(h.investedBefore + h.cashBefore)}円 <ArrowRight size={16} />{' '}
          {yen(h.totalAfter)}円
        </strong>
      </div>
      <div className="resolved-balances">
        <span>
          投資 <b>{yen(h.investedAfter)}円</b>
        </span>
        <span>
          現金 <b>{yen(h.cashAfter)}円</b>
        </span>
        {h.dividend + h.strategyDividend > 0 && (
          <span className="positive">
            配当 +{yen(h.dividend + h.strategyDividend)}円
          </span>
        )}
      </div>
      {h.decision === 'panic' && (
        <p className="resolved-note">翌年、現金の30%を自動再投資します。</p>
      )}
      <div className="resolved-actions">
        <Button
          variant="ghost"
          className="secondary-button"
          onClick={() => setDetails(true)}
        >
          <Info /> 計算の詳細
        </Button>
        <Button className="primary" onClick={() => commit({ type: 'NEXT' })}>
          年末の出来事を確認
          <ArrowRight />
        </Button>
      </div>
      <Dialog open={details} onOpenChange={setDetails}>
        <DialogContent className="history-dialog outcome-dialog">
          <DialogTitle>{s.turn}年目の結果</DialogTitle>
          <DialogDescription>
            使用戦略と相場による資産の変化。
          </DialogDescription>
          <StrategyOutcome entry={h} />
          <div className="settlement">
            <div>
              <span>総資産</span>
              <strong>
                {yen(h.investedBefore + h.cashBefore)} → {yen(h.totalAfter)}円
              </strong>
            </div>
            <div>
              <span>投資資産</span>
              <strong>
                {yen(h.investedBefore)} → {yen(h.investedAfter)}円
              </strong>
            </div>
            <div>
              <span>現金</span>
              <strong>
                {yen(h.cashBefore)} → {yen(h.cashAfter)}円
              </strong>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function ShopBoard({
  state: s,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  return (
    <section className="shop-board">
      <div className="board-screen-heading">
        <Landmark />
        <div>
          <span className="eyebrow gold">THE BROKER / SHOP</span>
          <h2>次の戦いに、備える。</h2>
        </div>
      </div>
      <Tabs defaultValue="equipment" className="shop-tabs">
        <TabsList>
          <TabsTrigger value="equipment">装備変更</TabsTrigger>
          <TabsTrigger value="cards">カード購入</TabsTrigger>
          <TabsTrigger value="remove">カード削除</TabsTrigger>
        </TabsList>
        <TabsContent value="equipment">
          <div className="shop-tab-caption">
            変更手数料 {yen(brokerFee(s))}円{' '}
            <span>総資産の1%・最低5,000円</span>
          </div>
          <div className="shop-equipment-grid">
            {Object.values(ASSETS).map((a) => {
              const Icon = equipmentIcons[a.id];
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`shop-equipment ${s.assetType === a.id ? 'equipped' : ''}`}
                  disabled={s.assetType === a.id}
                  onClick={() =>
                    commit({ type: 'SHOP_ASSET', assetId: a.id as AssetId })
                  }
                >
                  <Icon style={{ color: a.color }} />
                  <span className="eyebrow">{a.type}</span>
                  <h3>{a.name}</h3>
                  <p>{a.description}</p>
                  <dl>
                    <div>
                      <dt>得意</dt>
                      <dd>{a.strong}</dd>
                    </div>
                    <div>
                      <dt>苦手</dt>
                      <dd>{a.weak}</dd>
                    </div>
                  </dl>
                  <span className="equipment-action">
                    {s.assetType === a.id ? (
                      <>
                        <Check size={14} />
                        装備中
                      </>
                    ) : (
                      <>
                        この装備に変更
                        <ArrowRight size={14} />
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="cards">
          <div className="shop-tab-caption">
            今回の品ぞろえ{' '}
            <span>獲得カードは捨て札へ。次のシャッフルで登場。</span>
          </div>
          <div className="shop-card-spread">
            {s.shopOffers.map((o) => (
              <StrategyCard
                key={o.id}
                cardId={o.cardId}
                disabled={o.purchased || totalAssets(s) < CARDS[o.cardId].price}
                footer={
                  o.purchased
                    ? '購入済み'
                    : totalAssets(s) < CARDS[o.cardId].price
                      ? '資産不足'
                      : `${yen(CARDS[o.cardId].price)}円で購入`
                }
                onClick={() => commit({ type: 'SHOP_BUY', offerId: o.id })}
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="remove">
          <div className="shop-tab-caption">
            デッキから1枚削除 · {yen(CARD_CONFIG.removalCost)}円{' '}
            <span>削除はすぐに確定します。</span>
          </div>
          <DeckList state={s} removal commit={commit} />
        </TabsContent>
      </Tabs>
      <div className="shop-board-footer">
        <p>
          現金から優先して支払い、不足分は投資資産から。
          <span>カード購入・削除 合計 {yen(s.shopSpent)}円</span>
        </p>
        <Button
          className="primary"
          onClick={() => commit({ type: 'LEAVE_SHOP' })}
        >
          相場へ進む
          <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
function RewardBoard({
  state: s,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  return (
    <section className="reward-board">
      <div className="board-screen-heading">
        <Gift />
        <div>
          <span className="eyebrow gold">STRATEGY REWARD</span>
          <h2>次の一手を、手に入れよう。</h2>
        </div>
      </div>
      <p>1枚を獲得するか、スキップしてデッキを絞る。</p>
      <div className="reward-card-spread">
        {s.rewardChoices.map((id) => (
          <StrategyCard
            key={id}
            cardId={id}
            footer="この戦略を獲得"
            onClick={() => commit({ type: 'REWARD', cardId: id })}
          />
        ))}
      </div>
      <div className="reward-board-footer">
        <span>獲得カードは捨て札へ。次のシャッフルで登場。</span>
        <Button
          variant="outline"
          className="secondary-button"
          onClick={() => commit({ type: 'REWARD', cardId: null })}
        >
          スキップして進む
          <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
export function GameBoard({
  state,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  return (
    <div className={`board-content board-phase-${state.phase}`}>
      {(state.phase === 'incident' || state.phase === 'incidentResult') && (
        <IncidentBoard state={state} commit={commit} />
      )}
      {(state.phase === 'forecast' || state.phase === 'decision') && (
        <div className="battle-board">
          <Encounter state={state} commit={commit} />
          <div className="battle-dock">
            <HandPanel
              state={state}
              commit={commit}
              disabled={state.phase !== 'decision'}
              compact
            />
            <StrategyCommit state={state} commit={commit} />
          </div>
        </div>
      )}
      {state.phase === 'turnResult' && (
        <YearResult state={state} commit={commit} />
      )}
      {state.phase === 'broker' && <ShopBoard state={state} commit={commit} />}
      {state.phase === 'reward' && (
        <RewardBoard state={state} commit={commit} />
      )}
    </div>
  );
}
