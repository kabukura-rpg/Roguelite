'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Gem,
  Shield,
  Sparkles,
  Coins,
  Trophy,
  Check,
  Info,
  RotateCcw,
} from 'lucide-react';
import { GameBoard, GameHUD, GameTools } from '@/components/game/board';
import { IncidentLog } from '@/components/game/incidents';
import { INCIDENTS } from '@/lib/game/incidents';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DeckList,
  StrategyOutcome,
  CardResult,
} from '@/components/game/strategy';
import { CARDS, selectedCard, type CardId } from '@/lib/game/cards';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  ASSETS,
  MARKET_EVENTS,
  DECISIONS,
  GAME_CONFIG as C,
  type AssetId,
} from '@/lib/game/data';
import {
  createGame,
  reducer,
  totalAssets,
  calculateRank,
  calculateTitles,
  getAdjustedEventWeights,
  assetHistoryPoints,
  type State,
  type Action,
} from '@/lib/game/engine';
const yen = (n: number) => Math.round(n).toLocaleString('ja-JP');
const pct = (n: number) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${yen(n)}円`;
const icons = {
  compass: Compass,
  sparkles: Sparkles,
  coins: Coins,
  gem: Gem,
  shield: Shield,
};
function AssetIcon({ id, size = 24 }: { id: AssetId; size?: number }) {
  const Icon = icons[ASSETS[id].icon];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
function seedOptions() {
  const params = new URLSearchParams(window.location.search);
  const n = params.get('seed');
  return {
    seed:
      n !== null && /^\d+$/.test(n)
        ? Number(n) >>> 0
        : crypto.getRandomValues(new Uint32Array(1))[0],
    debug: params.get('debug') === '1',
  };
}
function Chart({ state }: { state: State }) {
  const timeline = assetHistoryPoints(state);
  const values = timeline.map((point) => point.total);
  const high = Math.max(...values) * 1.12;
  const low = Math.min(...values) * 0.8;
  const x = (i: number) => 66 + (i / 20) * 790;
  const y = (v: number) => 174 - ((v - low) / (high - low)) * 145;
  const points = values
    .map((v, i) => `${x(timeline[i].year)},${y(v)}`)
    .join(' ');
  return (
    <div className="chart">
      <div className="section-line">
        <span>資産の軌跡</span>
        <span className="chart-legend">
          <i /> 総資産 <small>— 初期資産</small>
        </span>
      </div>
      <svg
        viewBox="0 0 880 210"
        // SVG chart uses an explicit image role for assistive technology.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={`資産推移：初期100万円から${timeline.at(-1)!.year}年目${yen(totalAssets(state))}円。年ごとの詳細は冒険の記録で確認できます。`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dab77c" stopOpacity=".18" />
            <stop offset="1" stopColor="#dab77c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[low, (high + low) / 2, high].map((v) => (
          <g key={v}>
            <line
              x1="66"
              x2="856"
              y1={y(v)}
              y2={y(v)}
              stroke="#2a3443"
              strokeDasharray="3 6"
            />
            <text x="52" y={y(v) + 4} textAnchor="end">
              {Math.round(v / 10000)}万
            </text>
          </g>
        ))}
        <line
          x1="66"
          x2="856"
          y1={y(C.initialTotal)}
          y2={y(C.initialTotal)}
          stroke="#7e8a9c"
          strokeDasharray="5 6"
        />
        <polygon
          points={`${points} ${x(timeline.at(-1)!.year)},184 66,184`}
          fill="url(#chart-fill)"
        />
        <polyline
          points={points}
          stroke="#dab77c"
          fill="none"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={x(timeline[i].year)}
            cy={y(v)}
            r={i === values.length - 1 ? 4 : 2.5}
            fill="#dab77c"
          >
            <title>
              {timeline[i].year}年目：{yen(v)}円
            </title>
          </circle>
        ))}
        {[0, 5, 10, 15, 20].map((i) => (
          <text key={i} x={x(i)} y="205" textAnchor="middle">
            {i}年
          </text>
        ))}
      </svg>
    </div>
  );
}
function AssetChoices({
  current,
  onSelect,
  broker = false,
}: {
  current?: AssetId;
  onSelect: (id: AssetId) => void;
  broker?: boolean;
}) {
  return (
    <div className="asset-grid">
      {Object.values(ASSETS).map((a) => (
        <button
          type="button"
          className={`asset-card ${current === a.id ? 'selected' : ''}`}
          key={a.id}
          onClick={() => onSelect(a.id)}
          disabled={broker && current === a.id}
          style={{ '--asset-color': a.color } as CSSProperties}
        >
          <div className="asset-top">
            <AssetIcon id={a.id} />
            {current === a.id ? <Check size={17} /> : <ArrowRight size={17} />}
          </div>
          <span className="asset-type">{a.type}</span>
          <h3>{a.name}</h3>
          <p>{a.description}</p>
          <div className="asset-traits">
            <span>
              得意 <b>{a.strong}</b>
            </span>
            <span>
              苦手 <b>{a.weak}</b>
            </span>
          </div>
          <span className="asset-choose">
            {broker && current === a.id
              ? '保有中'
              : broker
                ? 'この資産に変更'
                : 'この資産で出発'}{' '}
            <ArrowRight size={14} />
          </span>
        </button>
      ))}
    </div>
  );
}
function HistoryTable({ state }: { state: State }) {
  return state.history.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          {[
            '年',
            '投資先',
            '相場',
            '戦略カード',
            '判断',
            '適用リターン',
            '総資産',
            '前年比',
            '配当',
            '手数料',
            'ショップ',
          ].map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.history.map((h, i) => (
          <TableRow key={h.turn}>
            <TableCell>{h.turn}</TableCell>
            <TableCell>{ASSETS[h.assetType].name}</TableCell>
            <TableCell>
              {MARKET_EVENTS.find((e) => e.id === h.marketEvent)?.name}
            </TableCell>
            <TableCell>{h.cardId ? CARDS[h.cardId].name : 'なし'}</TableCell>
            <TableCell>
              {h.resolution === 'strategy' ? '使用戦略' : DECISIONS[h.decision]}
            </TableCell>
            <TableCell>
              {pct(h.baseReturn)} → {pct(h.effectiveReturn)}
            </TableCell>
            <TableCell className="number">{yen(h.totalAfter)}円</TableCell>
            <TableCell
              className={
                h.totalAfter -
                  (i ? state.history[i - 1].totalAfter : C.initialTotal) >=
                0
                  ? 'positive'
                  : 'negative'
              }
            >
              {signed(
                h.totalAfter -
                  (i ? state.history[i - 1].totalAfter : C.initialTotal),
              )}
            </TableCell>
            <TableCell>{yen(h.dividend + h.strategyDividend)}円</TableCell>
            <TableCell>{yen(h.brokerFee)}円</TableCell>
            <TableCell>{yen(h.shopSpent)}円</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <p className="empty-note">
      最初の年が終わると、ここに相場と判断が記録されます。
    </p>
  );
}
type ModelTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};
export default function Home() {
  const [state, setState] = useState<State>(() => createGame());
  const stateRef = useRef(state);
  const [help, setHelp] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const commit = (action: Action) => {
    const next = reducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    return next;
  };
  const start = () => commit({ type: 'START', ...seedOptions() });
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: ModelTool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const snapshot = () => {
      const s = stateRef.current;
      const incident =
        s.phase === 'incident'
          ? INCIDENTS.find((e) => e.id === s.currentIncident)
          : undefined;
      return {
        incident: incident
          ? {
              id: incident.id,
              kind: incident.kind,
              name: incident.name,
              description: incident.description,
              cost: incident.cost,
              choices:
                incident.choices ??
                (incident.kind === 'life'
                  ? ['pay']
                  : ['panic', 'hold', 'buyMore']),
            }
          : undefined,
        incidentResult:
          s.phase === 'incidentResult' ? s.incidentHistory.at(-1) : undefined,
        nextLossShield: s.nextLossShield,
        detailedForecast:
          s.phase === 'forecast' && s.forecastInsight
            ? Object.fromEntries(
                Object.entries(
                  MARKET_EVENTS.find((e) => e.id === s.eventId)!.returns,
                ).map(([id, rate]) => [
                  id,
                  rate > 0 ? '上向き' : rate < 0 ? '下向き' : '横ばい',
                ]),
              )
            : undefined,
        phase: s.phase,
        year: s.turn,
        asset: s.assetType,
        invested: s.investedAssets,
        cash: s.cash,
        total: totalAssets(s),
        completedYears: s.history.length,
        hand: s.hand.map((id) => s.deck.find((c) => c.id === id)),
        selectedCard: selectedCard(s),
        rebalanceTarget: s.rebalanceTarget,
        drawCount: s.drawPile.length,
        discardCount: s.discardPile.length,
        deckSize: s.deck.length,
        effects: {
          dividendTurns: s.dividendTurns,
          contrarianPending: s.contrarianPending,
        },
        rewardChoices: s.phase === 'reward' ? s.rewardChoices : undefined,
        shopOffers: s.phase === 'broker' ? s.shopOffers : undefined,
        deck: s.deck,
        market: ['decision', 'turnResult', 'clear', 'gameOver'].includes(
          s.phase,
        )
          ? s.eventId
          : undefined,
        forecast:
          s.phase === 'forecast'
            ? MARKET_EVENTS.find((e) => e.id === s.eventId)?.forecast
            : undefined,
      };
    };
    const tools: ModelTool[] = [
      {
        name: 'read_kabukura_game',
        description: '現在の年、画面、資産と公開済みの市場情報を読む。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => snapshot(),
      },
      {
        name: 'play_kabukura_action',
        description:
          '画面と同じ操作で進める。select_cardで手札のinstanceId（nullで解除）、rebalance_targetで装備を選択しresolveで進行確定。rewardはcardId（nullでスキップ）。ショップはshop_asset、shop_buy、shop_remove、leave_shop。突発イベントはincident_choiceでchoiceIdを選び、incident_nextで結果から進む。市場ショックのみpanic/hold/buyMore、生活トラブルはpay。',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'start',
                'select_asset',
                'broker',
                'reveal',
                'resolve',
                'incident_choice',
                'incident_next',
                'next',
                'select_card',
                'rebalance_target',
                'reward',
                'shop_asset',
                'shop_buy',
                'shop_remove',
                'leave_shop',
              ],
            },
            assetId: { type: 'string', enum: Object.keys(ASSETS) },
            instanceId: { type: ['string', 'null'] },
            cardId: {
              type: ['string', 'null'],
              enum: [...Object.keys(CARDS), null],
            },
            offerId: { type: 'string' },
            choiceId: { type: 'string' },
          },
          required: ['action'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== 'object')
            throw new Error('操作を指定してください');
          const v = input as Record<string, unknown>;
          let action: Action;
          if (v.action === 'start')
            action = { type: 'START', ...seedOptions() };
          else if (
            (v.action === 'select_asset' || v.action === 'broker') &&
            typeof v.assetId === 'string' &&
            Object.hasOwn(ASSETS, v.assetId)
          )
            action = {
              type: v.action === 'broker' ? 'BROKER' : 'SELECT_ASSET',
              assetId: v.assetId as AssetId,
            };
          else if (
            v.action === 'incident_choice' &&
            typeof v.choiceId === 'string'
          )
            action = { type: 'INCIDENT_CHOICE', choiceId: v.choiceId };
          else if (v.action === 'incident_next')
            action = { type: 'INCIDENT_NEXT' };
          else if (v.action === 'resolve') action = { type: 'RESOLVE' };
          else if (v.action === 'reveal') action = { type: 'REVEAL' };
          else if (v.action === 'next') action = { type: 'NEXT' };
          else if (
            v.action === 'select_card' &&
            (v.instanceId === null || typeof v.instanceId === 'string')
          )
            action = { type: 'SELECT_CARD', instanceId: v.instanceId };
          else if (
            v.action === 'reward' &&
            (v.cardId === null ||
              (typeof v.cardId === 'string' && Object.hasOwn(CARDS, v.cardId)))
          )
            action = { type: 'REWARD', cardId: v.cardId as CardId | null };
          else if (
            (v.action === 'rebalance_target' || v.action === 'shop_asset') &&
            typeof v.assetId === 'string' &&
            Object.hasOwn(ASSETS, v.assetId)
          )
            action = {
              type:
                v.action === 'shop_asset' ? 'SHOP_ASSET' : 'REBALANCE_TARGET',
              assetId: v.assetId as AssetId,
            };
          else if (v.action === 'shop_buy' && typeof v.offerId === 'string')
            action = { type: 'SHOP_BUY', offerId: v.offerId };
          else if (
            v.action === 'shop_remove' &&
            typeof v.instanceId === 'string'
          )
            action = { type: 'SHOP_REMOVE', instanceId: v.instanceId };
          else if (v.action === 'leave_shop') action = { type: 'LEAVE_SHOP' };
          else throw new Error('操作または選択肢が不正です');
          const before = stateRef.current;
          let after = before;
          flushSync(() => {
            after = commit(action);
          });
          if (after === before) throw new Error('現在の画面では実行できません');
          return snapshot();
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {});
      } catch {
        /* Optional API: the game remains fully usable without it. */
      }
    }
    return () => controller.abort();
  }, []);
  const s = state;
  const total = totalAssets(s);
  const last = s.history.at(-1);
  const finished = s.phase === 'clear' || s.phase === 'gameOver';
  const active = !['title', 'select'].includes(s.phase);
  return (
    <main className={active ? `shell game-shell phase-${s.phase}` : 'shell'}>
      {!active && (
        <header className="topbar">
          <div className="brand">
            <Compass />
            <span>
              株クラ<span className="brand-sub">KABUKURA</span>
            </span>
          </div>
          <span className="eyebrow">PORTFOLIO ROGUELITE</span>
          <Button
            variant="ghost"
            className="help-button"
            onClick={() => setHelp(true)}
          >
            <BookOpen /> 遊び方
          </Button>
        </header>
      )}
      {s.phase === 'title' ? (
        <section className="title-screen">
          <div className="eyebrow gold">A JOURNEY THROUGH THE MARKET</div>
          <div className="emblem">
            <Compass size={64} strokeWidth={1} />
          </div>
          <h1>
            相場という、
            <br />
            <em>冒険へ。</em>
          </h1>
          <p>
            100万円を元手に、20年間の市場を生き抜く。
            <br />
            装備を選び、手札を組み合わせ、相場を攻略する。
          </p>
          <Button className="primary" onClick={start}>
            冒険をはじめる <ArrowRight />
          </Button>
          <div className="title-facts">
            <span>
              <Coins /> 初期資産 100万円
            </span>
            <span>
              <Compass /> 全20年の旅
            </span>
            <span>
              <Shield /> 5つの装備 × 8つの戦略
            </span>
          </div>
        </section>
      ) : null}
      {s.phase === 'select' ? (
        <section className="selection-screen">
          <div className="section-heading">
            <div>
              <span className="eyebrow gold">PREPARATION / 旅の支度</span>
              <h1 className="page-title">最初の装備を選ぼう。</h1>
              <p>80万円をひとつの資産へ。20万円は、次の一手のために。</p>
            </div>
            <span className="setup-money">
              初期資産
              <strong>
                1,000,000 <small>円</small>
              </strong>
            </span>
          </div>
          <AssetChoices
            onSelect={(id) => commit({ type: 'SELECT_ASSET', assetId: id })}
          />
          <div className="info-line">
            <Info size={17} />
            <span>
              初期デッキは10枚。毎年5枚を引き、戦略カードを1枚まで使えます。装備は証券会社で変更できます。
            </span>
          </div>
          <Button
            variant="ghost"
            className="secondary-button"
            onClick={() => commit({ type: 'TITLE' })}
          >
            ← タイトルへ
          </Button>
        </section>
      ) : null}
      {active && (
        <>
          <GameHUD state={s} />
          {finished ? (
            <div className="result-scroll">
              <section className="panel final-result">
                <div className="rank-seal">
                  <span>INVESTOR RANK</span>
                  <strong>{calculateRank(total)}</strong>
                </div>
                <div className="final-copy">
                  <span className="eyebrow gold">
                    {s.phase === 'clear' ? '20 YEARS SURVIVED' : 'GAME OVER'}
                  </span>
                  <h2>
                    {s.phase === 'clear'
                      ? '20年間の相場を、生き抜いた。'
                      : 'ここで、冒険の幕が下りる。'}
                  </h2>
                  <p>
                    {s.phase === 'clear'
                      ? '積み重ねた判断が、あなたの投資史になりました。'
                      : 'この経験を、次の旅の糧に。'}
                  </p>
                  <div className="titles">
                    {calculateTitles(s).map((t) => (
                      <span key={t}>
                        <Trophy size={14} />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="result-stats">
                  <div>
                    <span>最大ドローダウン</span>
                    <strong className="negative">{pct(s.maxDrawdown)}</strong>
                  </div>
                  <div>
                    <span>暴落経験</span>
                    <strong>
                      {s.crashCount + s.severeCrashCount}
                      <small> 回</small>
                    </strong>
                    <small>うち歴史的大暴落 {s.severeCrashCount}回</small>
                  </div>
                  <div>
                    <span>カードを使わず進行</span>
                    <strong>
                      {
                        s.history.filter(
                          (h) => h.resolution === 'strategy' && !h.cardId,
                        ).length
                      }
                      <small> 回</small>
                    </strong>
                  </div>
                </div>
                {s.phase === 'gameOver' && s.history.length < s.turn && (
                  <p className="last-year-note negative">
                    {s.turn}
                    年目のショップで資産が0円になりました。カード購入・削除{' '}
                    {yen(s.shopSpent)}円 / 装備変更 {yen(s.brokerFee)}円。
                  </p>
                )}
                <CardResult state={s} />
                <IncidentLog state={s} />
                {last && (
                  <div className="final-strategy-detail">
                    <span className="label">最後に記録された相場と戦略</span>
                    <StrategyOutcome entry={last} />
                  </div>
                )}
                {last && (
                  <p className="last-year-note">
                    {last.year}年目：
                    {MARKET_EVENTS.find((e) => e.id === last.marketEvent)?.name}
                    を
                    {last.resolution === 'strategy'
                      ? '戦略で対応'
                      : DECISIONS[last.decision]}
                    。
                    {last.dividend + last.strategyDividend > 0
                      ? `配当 ${yen(last.dividend + last.strategyDividend)}円。`
                      : ''}
                  </p>
                )}
                <div className="final-buttons">
                  <Button className="primary" onClick={start}>
                    <RotateCcw /> もう一度、冒険へ
                  </Button>
                  <Button
                    variant="outline"
                    className="secondary-button"
                    onClick={() => commit({ type: 'TITLE' })}
                  >
                    タイトルへ
                  </Button>
                </div>
              </section>

              <section className="panel chart-panel">
                <Chart state={s} />
                <div className="chart-foot">
                  <span>初期資産 1,000,000円</span>
                  <span>
                    最大DD <b>{pct(s.maxDrawdown)}</b>
                  </span>
                </div>
              </section>
            </div>
          ) : (
            <GameBoard state={s} commit={commit} />
          )}
          <GameTools
            state={s}
            onDeck={() => setDeckOpen(true)}
            onHistory={() => setHistoryOpen(true)}
            onHelp={() => setHelp(true)}
            onDebug={() => setDebugOpen(true)}
          />
        </>
      )}
      <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
        <DialogContent className="history-dialog">
          <DialogTitle>デバッグ情報</DialogTitle>
          <DialogDescription>相場・カード状態と計算の詳細。</DialogDescription>

          <details className="debug-panel">
            <summary>DEBUG · SEED {s.seed}</summary>
            <p>
              イベント：{s.eventId} / 前回証券会社から {s.turnsSinceBroker}年 /
              最大DD {pct(s.maxDrawdown)}
            </p>
            {s.phase === 'forecast' && (
              <div className="debug-buttons">
                {MARKET_EVENTS.map((e) => (
                  <Button
                    key={e.id}
                    variant="outline"
                    onClick={() =>
                      commit({ type: 'FORCE_EVENT', eventId: e.id })
                    }
                  >
                    {e.name}
                  </Button>
                ))}
              </div>
            )}
            <pre>
              {JSON.stringify(
                {
                  weights: getAdjustedEventWeights(s.history),
                  lastTurn: last,
                  deck: s.deck,
                  hand: s.hand,
                  drawPile: s.drawPile,
                  discardPile: s.discardPile,
                  dividendTurns: s.dividendTurns,
                  contrarianPending: s.contrarianPending,
                  cardRng: s.cardRng,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogTitle>冒険の手引き</DialogTitle>
          <DialogDescription>
            戦略カードで相場に挑み、20年間を生き抜こう。
          </DialogDescription>
          <ol className="help-list">
            <li>
              <strong>投資先を選ぶ</strong>
              <p>
                100万円のうち80万円を投資、20万円を現金で持って出発します。同時に持てる投資先は1種類です。
              </p>
            </li>
            <li>
              <strong>予報を読み、相場を見る</strong>
              <p>
                市場予報は傾向のヒント。相場公開後も騰落率や予想資産は表示されません。実際の騰落率は、進行後のRESULTで初めて分かります。
              </p>
            </li>
            <li>
              <strong>手札から戦略を0〜1枚選ぶ</strong>
              <p>
                初期デッキは10枚。毎年5枚を引き、戦略カードを1枚まで使用できます。選択・解除・選び直しは進行確定まで自由。未使用を含む手札は年末に捨て、山札が尽きたら捨て札をシャッフルします。
              </p>
            </li>
            <li>
              <strong>戦略を確定して、結果を見る</strong>
              <p>
                選んだカードを使うか、カードを使わずに進みます。ドルコスト平均法は現金75%、逆張りは現金50%を追加投資。現金確保は投資額20%を現金化します。カードなしなら現在の配分を維持します。
              </p>
            </li>
            <li>
              <strong>年末の突発イベントを乗り越える</strong>
              <p>
                通常相場の処理後、発生可能な年は30%で突発イベント。連続年には発生せず、20年完走なら最低4回、同じ出来事は一度だけです。市場ショックだけは狼狽売り・ホールド・買い増しから選び、騰落率は選択後に判明します。生活トラブルは現金優先で支払い、不足分を強制売却。日常の選択では現金・カード・次回の詳細予報・次の通常相場の下落半減を得られます。任意の参加費は現金が必要です。継続効果は重複せず、最終年には次の通常相場がありません。
              </p>
            </li>
            <li>
              <strong>証券会社で投資先を見直す</strong>
              <p>
                3〜5年ごとに到着。装備変更は総資産の1%（最低5,000円）、カード削除は3万円。カードも購入できます。現金を優先し、不足分は投資資産から支払います。現状維持は無料です。
              </p>
            </li>
            <li>
              <strong>報酬と継続効果を活用する</strong>
              <p>
                3年ごとの報酬で戦略を1枚獲得、またはスキップ。獲得カードは捨て札に入り、次のシャッフルで登場します。「配当金」は使用年を含む3年間、年末投資額の1%。高配当株の1.5%と別に受け取れます。再使用は期間のみ延長。「逆張り」は条件達成後、次に保有資産がプラスとなる相場で1回発動します。
              </p>
            </li>
            <li>
              <strong>20年後、あなたの成績へ</strong>
              <p>
                最終資産でランクが決まり、判断に応じた称号も獲得。最大DDは、旅の最高資産からの最大下落率です。資産が0円になると冒険終了です。
              </p>
            </li>
          </ol>
          <p className="disclaimer">
            架空の相場を用いたゲームです。実際の市場や投資成果を再現するものではありません。
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="history-dialog">
          <DialogTitle>冒険の記録</DialogTitle>
          <DialogDescription>
            {s.history.length}年分の相場と、あなたの判断。
          </DialogDescription>
          <Chart state={s} />
          <div className="record-summary">
            <span>投資資産 {yen(s.investedAssets)}円</span>
            <span>最大DD {pct(s.maxDrawdown)}</span>
            <span>初期資産比 {pct(total / C.initialTotal - 1)}</span>
          </div>
          <HistoryTable state={s} />
          <IncidentLog state={s} />
        </DialogContent>
      </Dialog>
      <Dialog open={deckOpen} onOpenChange={setDeckOpen}>
        <DialogContent className="history-dialog deck-dialog">
          <DialogTitle>あなたの投資戦略 · {s.deck.length}枚</DialogTitle>
          <DialogDescription>
            装備はデッキに含まれません。山札の並び順は表示していません。
          </DialogDescription>
          <DeckList state={s} />
        </DialogContent>
      </Dialog>
      {!active && (
        <footer>
          <span className="footer-brand">株クラ</span>
          <span>PORTFOLIO ROGUELITE</span>
          <span>20 YEARS. YOUR CHOICES.</span>
        </footer>
      )}
    </main>
  );
}
