import type { Metadata } from 'next';
import './globals.css';
import './board.css';
export const metadata: Metadata = {
  title: '株クラ｜20年の相場を生き抜く',
  description:
    '100万円から始まる、ポートフォリオ構築型ローグライト。5つの装備、8つの戦略カードと3つの基本コマンドで、20年間の相場を攻略しよう。',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
