'use client';
import { useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Coins,
  Gem,
  Shield,
  Layers,
  Wallet,
  Sprout,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { ASSETS } from '@/lib/game/data';
import {
  portfolioAllocation,
  LONG_TERM_STRATEGIES,
  growthOption,
} from '@/lib/game/portfolio';
import type { State, Action } from '@/lib/game/engine';
const icons = {
  coins: Coins,
  gem: Gem,
  shield: Shield,
  layers: Layers,
  wallet: Wallet,
};
export function PortfolioSummary({
  state: s,
  final = false,
}: {
  state: State;
  final?: boolean;
}) {
  return (
    <section
      className="portfolio-summary"
      aria-label={final ? '最終ポートフォリオ' : 'ポートフォリオ'}
    >
      <div>
        <h3 className="eyebrow gold">
          {final ? 'FINAL PORTFOLIO' : 'PORTFOLIO'}
        </h3>
        <dl className="portfolio-positions">
          {portfolioAllocation(s.assetType, s.satellites).map((p, i) => (
            <div key={p.assetId}>
              <dt>
                <small>{i === 0 ? 'CORE' : 'SATELLITE'}</small>
                {ASSETS[p.assetId].name}
              </dt>
              <dd>{Math.round(p.weight * 100)}%</dd>
            </div>
          ))}
        </dl>
        <p>投資資産の内訳です。現金は含みません。</p>
      </div>
      <div>
        <h3 className="eyebrow gold">LONG TERM STRATEGY</h3>
        {(s.longTermStrategies ?? []).length ? (
          <ul className="portfolio-policies">
            {s.longTermStrategies.map((id) => (
              <li key={id}>
                <strong>{LONG_TERM_STRATEGIES[id].name}</strong>
                <span>{LONG_TERM_STRATEGIES[id].description}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>長期投資方針はまだありません。</p>
        )}
      </div>
    </section>
  );
}
export function PortfolioHUD({ state: s }: { state: State }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="portfolio-hud-control"
        onClick={() => setOpen(true)}
        aria-label="ポートフォリオと長期投資方針を確認"
      >
        <span>
          PORTFOLIO <Info size={11} />
        </span>
        <div>
          {portfolioAllocation(s.assetType, s.satellites).map((p) => (
            <div key={p.assetId}>
              <span>{ASSETS[p.assetId].name}</span>
              <b>{Math.round(p.weight * 100)}%</b>
            </div>
          ))}
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="history-dialog portfolio-dialog">
          <DialogTitle>あなたの投資ビルド</DialogTitle>
          <DialogDescription>
            コアは固定。4年ごとの成長でサテライトと長期方針を獲得します。
          </DialogDescription>
          <PortfolioSummary state={s} />
          <p className="portfolio-deck-note">
            DECK · {s.deck.length}枚 / 毎年使う短期戦略
          </p>
          <p>現金 {s.cash.toLocaleString('ja-JP')}円</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function GrowthBoard({
  state: s,
  commit,
}: {
  state: State;
  commit: (a: Action) => unknown;
}) {
  return (
    <section className="growth-board" aria-label="ポートフォリオ成長">
      <div className="board-screen-heading">
        <Sprout />
        <div>
          <span className="eyebrow gold">PORTFOLIO GROWTH · YEAR {s.turn}</span>
          <h2>投資方針をひとつ選択</h2>
        </div>
      </div>
      <p className="growth-intro">
        20年のビルドに加わる恒久効果。サテライトは最大2つ、各20%。
      </p>
      <p className="growth-swipe-hint">← 横にスワイプで3候補 →</p>
      <div className="growth-choices">
        {s.growthChoices.map((id) => {
          const option = growthOption(id),
            Icon = icons[option.icon as keyof typeof icons];
          return (
            <button
              key={id}
              type="button"
              className="strategy-card growth-card"
              style={{ '--card-color': option.color } as CSSProperties}
              onClick={() => commit({ type: 'GROWTH', choiceId: id })}
            >
              <div className="strategy-top">
                <span>{option.kind}</span>
                <span>◇</span>
              </div>
              <div className="strategy-icon">
                <Icon size={34} strokeWidth={1.3} />
              </div>
              <h3>{option.name}</h3>
              <strong className="growth-summary">{option.summary}</strong>
              <p>{option.description}</p>
              <div className="strategy-footer">
                この方針を獲得 <ArrowRight size={16} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="growth-owned">
        <span>現在の構成</span>
        <p>
          {portfolioAllocation(s.assetType, s.satellites)
            .map(
              (p) => `${ASSETS[p.assetId].name} ${Math.round(p.weight * 100)}%`,
            )
            .join(' / ')}
        </p>
        <small>
          {(s.longTermStrategies ?? [])
            .map((id) => LONG_TERM_STRATEGIES[id].name)
            .join(' / ') || '長期投資方針なし'}
        </small>
      </div>
    </section>
  );
}
