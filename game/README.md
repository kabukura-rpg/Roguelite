# 株クラ

親フォルダの `kabukura_roguelite_game_spec.md` を実装した、20年完結の投資判断ローグライトです。既存の売買・相場システムを維持し、戦略カードとデッキ構築を追加しました。

## 起動

Node.js 22.13以上（推奨24）を使用してください。

```sh
npm install
npm run dev
```

ローカルURLは起動時に表示されます。開発サーバーを止めるとローカルプレビューは終了します。

```sh
npm test
npm run typecheck
npm run build
```

ビルドは静的出力 `dist/client/` を生成します。サーバー、ログイン、実市場APIはゲーム自体には不要です。途中セーブ・永続記録は実装しません。

## GitHub Pagesへの公開

公開先は **https://kabukura-rpg.github.io/Roguelite/**、リポジトリは `kabukura-rpg/Roguelite` です。

1. GitHubのリポジトリで **Settings → Pages → Build and deployment → Source → GitHub Actions** を選択します。
2. この変更をリポジトリの `main` にコミット・pushします。
3. **Actions → Deploy game to GitHub Pages** が成功すると公開されます。`Run workflow` からの手動実行にも対応します。

ルートの `.github/workflows/deploy-pages.yml` が `game/` でNode.js 24、`npm ci`、ゲームテスト、型チェック、静的ビルドとアセット検証を実行し、**`game/out/`** をPagesにデプロイします。`game/` やリポジトリ全体をそのまま公開する構成ではありません。追加のトークン登録は不要で、Actionsの `GITHUB_TOKEN` とOIDCを使用します。

公開用ビルドは `game/` 内で実行できます（macOS / Linux）。

```sh
npm ci
npm run build:pages
```

ローカル開発の `npm run dev` と従来の `npm run build` は引き続きNext.js互換のvinextを使います。Pages用の `build:pages` はNext.js 16.3.4の `next build --webpack` を使い、`out/` にHTML・CSS・JavaScript・publicファイルを静的出力します。ゲームロジックとスタイルは共通です。`npm start` は従来のWorker用で、Pages出力のプレビューには使いません。

`next.config.ts` の `output: 'export'`、`trailingSlash: true`、`images.unoptimized: true` によりサーバー不要で配信します。Pagesビルド時だけ `GITHUB_PAGES=true` で `basePath: '/Roguelite'` を設定します。CSS・JSはNext.jsがprefixを付与するため、別の `assetPrefix` は不要です。`public/` のfaviconには `NEXT_PUBLIC_BASE_PATH` を明示的に付けています。通常のローカル開発URLは `/` のままです。

`scripts/verify-pages.mjs` はトップページ・404・`.nojekyll` の存在と、HTML・CSSから参照する同一サイト内のアセットが `/Roguelite/` 内にあり、実ファイルとして出力されていることを検査します。`npm run verify:pages` でも再実行できます。ブラウザ操作のテストではありません。

`game/` は親リポジトリに通常ディレクトリとして登録されています。Gitの `160000`（gitlink）エントリ、`game/.git`、`.gitmodules` はありません。Actionsでもサブモジュールの取得を無効にし、gitlinkになっていないことと `game/package.json`・`game/app/page.tsx` の追跡を確認します。今後 `game/` 内で `git init` や `git submodule add` は行わず、親リポジトリから `git add game` で管理してください。

参考: [Next.js static export](https://nextjs.org/docs/app/guides/static-exports)、[basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)、[GitHub PagesのActions設定](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 実装

- `lib/game/data.ts`: 設定、5資産、10相場、リターン表、ランク境界
- `lib/game/engine.ts`: シード付き乱数、抽選補正、状態遷移、売買、再投資、配当、手数料、最大DD、称号
- `lib/game/cards.ts`: 8戦略カード、初期デッキ、山札・手札・捨て札、独立したシード付きシャッフル、使用集計
- `components/game/strategy.tsx`: 手札選択、デッキ一覧、報酬、カード購入・削除、カード使用結果
- `app/page.tsx`: 既存画面＋カード報酬、遊び方、全履歴、SVG資産グラフ
- `app/globals.css`: 共通テーマとタイトル・成績画面
- `app/board.css`: ビューポートに収まるHUD、相場、縦長手札、基本コマンド
- `components/game/board.tsx`: 相場盤面、コンパクトHUD、年末結果、タブ式ショップ、カード報酬
- `tests/engine.test.ts`: 仕様TC01〜10、手数料・整数丸め・連打・称号・ランク・200シード完走等の既存20テスト
- `tests/cards.test.ts`: 8カード×3コマンドの計算、効果の期限、報酬・購入・削除、100シードの完走、デッキ整合性

同じ `?seed=12345` とすると同じ相場系列を再現します。`?debug=1&seed=12345` は抽選重み、前後資産、判断、最大DD、証券会社間隔を表示し、予報画面で相場を強制できます。デバッグ指定時のみ有効です。

売却と再投資の端数は、移動額を四捨五入し反対側から同額を引くことで1円の増減を防ぎます。証券会社は最初の訪問を3〜5年目、以後3〜5年の間隔とし、変更手数料によるDDも記録します。変更手数料が総資産を超える場合は残額全額を差し引いてGAME OVERとなります。`crashCount` は通常暴落、`severeCrashCount` は歴史的大暴落を個別に数え、画面の暴落経験では合算します。

任意対応のWebMCP（`document.modelContext`）には `read_kabukura_game` と `play_kabukura_action` を登録します。未対応ブラウザでは通常のUIだけで動作します。WebMCP対応ブラウザ内での実行検証、およびブラウザ操作による画面の視覚検証は今回未実施です。

## カード版の計算順と補足

1. 前年の狼狽売り後の再投資 → 5枚までドロー → 必要ならショップ → 予報・相場公開。
2. 戦略カードを0〜1枚選択。確定まで資産は変わらず、選択・解除・リバランス先の変更が可能。
3. 基本コマンド確定時、リバランスの変更・手数料、または現金確保20%を処理。
4. 買い増しなら現金50%（ドルコスト平均法は75%）を投入。
5. 相場リターンに選択カードの補正を適用。待機中の逆張りは、保有資産の基礎リターンが正なら1.3倍して一度だけ消費。
6. 狼狽売りなら相場適用後に90%を現金化。
7. 高配当株の1.5%と戦略配当金の1%を、残った投資額からそれぞれ整数円で計算して現金へ。
8. 逆張りの発動条件を満たしたら次の相場以降に向けて待機。配当金の残り年数を減らし、DD・履歴を記録して手札すべてを捨てる。
9. 3・6・9・12・15・18年目の結果の後に報酬。ランダムな異なる3種類から1枚、またはスキップ。20年目は直接リザルト。

配当金は使用年を含む3年。重ね掛けは残り期間を3年延長し、1%の倍率を重複させません。逆張りは暴落系で買い増しを選ぶことが条件で、待機効果は重複しません。既存の待機が発動する年に再び条件を満たせば、次回分を待機できます。リバランスは現在公開されている相場を引き直さず、変更先のリターンで計算します。レバレッジで−100%を超えても投資資産は0円が下限で、借金は作りません。

獲得したカードは捨て札へ入り、次のシャッフルから抽選対象になります。同じ種類のカードもインスタンスIDで区別し、削除は選んだ1枚だけです。デッキが5枚未満なら存在する分だけドローし、0枚でも基本3コマンドは使えます。ショップ内で手札のカードを削除した場合は退出時に補充します。

ショップのカード価格は4〜7万円、削除は3万円。カード支払いも現金を優先し、不足分を投資資産から支払います。総資産不足なら購入・削除を拒否し、ちょうど全額の支払いはGAME OVERになります。品ぞろえは訪問ごとに異なる3種類で各1枚。装備の変更後もショップに留まり、退出ボタンで次へ進みます。

市場抽選の乱数とカードの乱数は分離しています。カードの選択・シャッフル・報酬取得で市場系列は変わりません。プレビューは同じ決算処理を複製状態へ適用し、本番の資産や山札・乱数を変更しません。

## ローカル用ゲーム盤レイアウト

プレイ中は画面の高さ（100dvh）に合わせたHUD・盤面・メニューの3段構成です。PCでは下部の縦長手札の右に基本コマンドを置き、幅が狭い場合は手札の下に並べます。カード選択で浮き上がりと金色の発光を表示し、動きを減らす設定にも対応します。

資産グラフ・投資額の詳細・履歴は下部の「記録」から開きます。年末結果は簡潔な決算表示と詳細ダイアログに分け、リバランス先の選択もダイアログに移しました。ショップは装備変更／カード購入／カード削除のタブ式で、退出ボタンは常時表示します。

スマホでは手札・報酬カードを横にスワイプします。小さい画面や文字拡大では必要に応じて盤面の一部をスクロールでき、操作を切り捨てません。成績画面と詳細パネルには縦スクロールを許可しています。今回のレイアウト改修はローカル確認用で、サイトへのアップロード・公開更新は行いません。
