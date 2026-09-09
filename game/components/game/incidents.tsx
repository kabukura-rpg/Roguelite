'use client';
import {
  ArrowRight,
  CloudLightning,
  HeartPulse,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CARDS } from '@/lib/game/cards';
import { PORTFOLIO_CONFIG, portfolioAllocation } from '@/lib/game/portfolio';
import { ASSETS } from '@/lib/game/data';
import { currentExpenseQuote, expensePayment } from '@/lib/game/expenses';
import { INCIDENTS } from '@/lib/game/incidents';
import { totalAssets, type State, type Action } from '@/lib/game/engine';

const yen = (value: number) => Math.round(value).toLocaleString('ja-JP');
export function IncidentBoard({
  state: s,
  commit,
}: {
  state: State;
  commit: (action: Action) => unknown;
}) {
  const event = INCIDENTS.find((e) => e.id === s.currentIncident)!;
  const quote = currentExpenseQuote(s, event);
  const bill = expensePayment(
    s.cash,
    s.investedAssets,
    quote,
    s.longTermStrategies,
  );
  const { required } = bill;
  const result =
    s.phase === 'incidentResult' ? s.incidentHistory.at(-1)! : null;
  const Icon =
    event.kind === 'shock'
      ? CloudLightning
      : event.kind === 'life'
        ? HeartPulse
        : Sparkles;
  const category = {
    shock: '市場ショック',
    life: '生活トラブル',
    chance: '日常 / チャンス',
  }[event.kind];
  const choices =
    event.kind === 'shock'
      ? [
          {
            id: 'panic',
            label: '狼狽売り',
            hint: '急変前に投資資産90%を現金化。損失を抑える一方、売却分の反発は逃す。翌年に現金30%を再投資。',
          },
          {
            id: 'hold',
            label: 'ホールド',
            hint: '現在の資産配分を維持する。急変の影響をそのまま受ける。',
          },
          {
            id: 'buyMore',
            label: '買い増し',
            hint: '現金50%を先に追加投資。反発の利益も下落の損失も大きくなる。',
          },
        ]
      : event.kind === 'life'
        ? [
            {
              id: 'pay',
              label:
                bill.forcedSale > 0
                  ? '資産を売却して支払いを確定'
                  : '支払いを確定',
              hint: '現金から支払い、不足分だけ投資資産を強制売却します。',
            },
          ]
        : event.choices!;
  return (
    <section
      className={`incident-board incident-${event.kind}`}
      aria-label={category}
    >
      <header>
        <span className="eyebrow gold">YEAR {s.turn} · AFTER HOURS</span>
        <span>{category}</span>
      </header>
      <div className="incident-body">
        <Icon className="incident-icon" size={42} strokeWidth={1.2} />
        <h2>{event.name}</h2>
        <p>{event.description}</p>
        {result ? (
          <div className="incident-outcome" aria-live="polite">
            <strong>{result.choice}</strong>
            <p>{result.message}</p>
            <div className="incident-change">
              資産変動{' '}
              <b>
                {result.totalAfter -
                  result.cashBefore -
                  result.investedBefore >=
                0
                  ? '+'
                  : ''}
                {yen(
                  result.totalAfter - result.cashBefore - result.investedBefore,
                )}
                円
              </b>
            </div>
            {result.rate !== null && (
              <p>ポートフォリオへの騰落率：{(result.rate * 100).toFixed(1)}%</p>
            )}
            {result.cost > 0 && (
              <p>
                支払額 {yen(result.cost)}円 / うち強制売却{' '}
                {yen(result.forcedSale)}円
              </p>
            )}
            {event.kind === 'life' && (
              <>
                <dl className="expense-balances">
                  <div>
                    <dt>現金</dt>
                    <dd>
                      {yen(result.cashBefore)}円 <ArrowRight size={14} />{' '}
                      {yen(result.cashAfter)}円
                    </dd>
                  </div>
                  <div>
                    <dt>投資資産</dt>
                    <dd>
                      {yen(result.investedBefore)}円 <ArrowRight size={14} />{' '}
                      {yen(result.investedAfter)}円
                    </dd>
                  </div>
                </dl>
                {!!result.soldAllocation?.length && (
                  <p className="expense-allocation">
                    比率を保って売却：
                    {result.soldAllocation
                      .map(
                        (p) =>
                          `${ASSETS[p.assetId].name} ${Math.round(p.weight * 100)}%`,
                      )
                      .join(' / ')}
                  </p>
                )}
                {(result.requiredCost ?? result.cost) > result.cost && (
                  <p className="expense-shortfall">
                    全資産を充てても {yen(result.requiredCost! - result.cost)}
                    円不足。これ以上の借金は発生しません。
                  </p>
                )}
              </>
            )}
            {result.card && (
              <p>獲得カード：{CARDS[result.card].name}（捨て札へ）</p>
            )}
            {event.kind !== 'life' && (
              <p>
                現金 {yen(result.cashAfter)}円 / 投資資産{' '}
                {yen(result.investedAfter)}円
              </p>
            )}
          </div>
        ) : (
          <>
            {event.kind === 'shock' && (
              <p className="incident-note">
                騰落率は選択後に確定します。戦略カードは使用しません。株式の値動きは大きく、金・債券への影響は比較的小さめです。
              </p>
            )}
            {event.kind === 'life' && (
              <div className="expense-bill">
                <div className="expense-amount">
                  <span>支払い必須</span>
                  <strong>
                    {yen(required)}
                    <small> 円</small>
                  </strong>
                </div>
                <p className="expense-calculation">
                  {quote.model === 'year'
                    ? `基本額 ${yen(quote.baseAmount)}円 · 資産補正 ${quote.amount >= quote.baseAmount ? '+' : ''}${yen(quote.amount - quote.baseAmount)}円`
                    : quote.model === 'tax'
                      ? '総資産の8%（8万〜30万円）'
                      : '保存済みの必要経費'}
                  {required < quote.amount ? ' · 生活防衛資金 −10%' : ''}
                </p>
                <dl className="expense-balances">
                  <div>
                    <dt>所持現金</dt>
                    <dd>{yen(s.cash)}円</dd>
                  </div>
                </dl>
                {bill.shortage > 0 ? (
                  // The shortfall is a live status for assistive technology.
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                  <div className="expense-shortfall" role="status">
                    <strong>
                      <TriangleAlert size={18} /> 現金が不足しています
                    </strong>
                    <p>
                      {yen(bill.shortage)}
                      円分の投資資産を売却する必要があります。
                    </p>
                    {bill.unpaid > 0 ? (
                      <p>
                        投資資産をすべて売却しても {yen(bill.unpaid)}
                        円不足し、冒険は終了します。
                      </p>
                    ) : (
                      <p>
                        保有比率を維持して売却。運用と配当の元本が減ります。
                      </p>
                    )}
                    <small>
                      {portfolioAllocation(s.assetType, s.satellites)
                        .map(
                          (p) =>
                            `${ASSETS[p.assetId].name} ${Math.round(p.weight * 100)}%`,
                        )
                        .join(' / ')}
                    </small>
                  </div>
                ) : (
                  <p className="expense-covered">
                    現金で支払えます。投資資産の売却は不要です。
                  </p>
                )}
              </div>
            )}
            {event.kind !== 'life' && (
              <div className="incident-choices">
                {choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={
                      s.cash < (('cost' in choice ? choice.cost : 0) ?? 0)
                    }
                    onClick={() =>
                      commit({ type: 'INCIDENT_CHOICE', choiceId: choice.id })
                    }
                  >
                    <strong>
                      {choice.label}
                      <ArrowRight size={16} />
                    </strong>
                    <span>{choice.hint}</span>
                    {'cost' in choice && s.cash < (choice.cost ?? 0) && (
                      <small>現金が不足しています</small>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <footer>
        {s.turn === 20 && (
          <small>
            最終年です。獲得カード・次回効果を使う通常相場はありません。
          </small>
        )}
        {result ? (
          <Button
            className="primary"
            onClick={() => commit({ type: 'INCIDENT_NEXT' })}
          >
            {totalAssets(s) <= 0 || s.turn === 20
              ? '成績を見る'
              : PORTFOLIO_CONFIG.growthYears.includes(s.turn) &&
                  !s.growthHistory.some((h) => h.turn === s.turn)
                ? 'ポートフォリオ成長へ'
                : s.turn % 3 === 0
                  ? 'カード報酬へ'
                  : '次の年へ'}
            <ArrowRight />
          </Button>
        ) : event.kind === 'life' ? (
          <Button
            className="primary"
            onClick={() => commit({ type: 'INCIDENT_CHOICE', choiceId: 'pay' })}
          >
            {choices[0].label}
            <ArrowRight size={16} />
          </Button>
        ) : (
          <small>
            通常相場の処理は完了しています。この出来事を解決して年を終えます。
          </small>
        )}
      </footer>
    </section>
  );
}
export function IncidentLog({ state }: { state: State }) {
  if (!state.incidentHistory.length) return null;
  return (
    <section className="incident-log">
      <h3>突発イベントの記録 · {state.incidentHistory.length}回</h3>
      <ol>
        {state.incidentHistory.map((record) => (
          <li key={record.id}>
            <strong>
              {record.turn}年目 ·{' '}
              {INCIDENTS.find((e) => e.id === record.id)?.name}
            </strong>
            <span>
              {record.choice} / 総資産 {yen(record.totalAfter)}円
            </span>
            <p>{record.message}</p>
            {record.rate !== null && (
              <small>騰落率 {(record.rate * 100).toFixed(1)}%</small>
            )}
            {record.cost > 0 && <small>支払額 {yen(record.cost)}円</small>}
            {record.card && (
              <small>獲得カード：{CARDS[record.card].name}</small>
            )}
            {record.forcedSale > 0 && (
              <small>強制売却 {yen(record.forcedSale)}円</small>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
