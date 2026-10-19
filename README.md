# Setlistic

[![CI](https://github.com/Laplusdestiny/setlistic/actions/workflows/ci.yml/badge.svg)](https://github.com/Laplusdestiny/setlistic/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Laplusdestiny/setlistic/graph/badge.svg)](https://codecov.io/gh/Laplusdestiny/setlistic)

カラオケで歌える曲を自分で登録・タグ付けしておき、お店でスマホからその場で探せる Web アプリです。PC ではまとめて登録・整理できます。

- 公開URL：https://setlistic.laplusdestiny.com
- 利用者：オーナーと招待した友人まで（招待制。一般公開はしていません）
- 使い方：アプリ内のヘルプ（[`/help`](https://setlistic.laplusdestiny.com/help)。ログイン不要）

## 主な機能

- Apple Music・Spotify・YouTube Music の共有URLから曲を登録（曲情報は iTunes の表記にそろえて保存）。まとめて登録にも対応
- タグ（グループ・別名つき）、キー、メモ、カスタム項目で曲を整理。タグの一括変更
- 歌える度・タグ・キーなど多観点での検索、ランダムに1曲選ぶ機能
- 「今日歌った！」の歌唱記録（歌った日・歌いやすさ・メモ）
- JSON / CSV のエクスポート、JSON のインポート、アカウント削除
- 管理者向けの招待の管理画面
- 初回チュートリアル、スマホのホーム画面に追加して PWA 風に使えるレイアウト、PC 用の3ペインレイアウト

これからの機能は [Issues](https://github.com/Laplusdestiny/setlistic/issues) で管理しています。

## 技術構成

| 層                     | 採用                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| フロント・API          | Next.js 16（App Router, TypeScript）、React 19。Vercel（Hobby、リージョン `hnd1`）         |
| DB                     | Supabase（PostgreSQL、無料プラン）。全テーブルに RLS                                       |
| 認証                   | Supabase Auth の Google OAuth のみ。招待制（許可リスト＋Before User Created フック）       |
| ORM / マイグレーション | Drizzle ORM。SQL は `supabase/migrations/`                                                 |
| 曲情報                 | iTunes Lookup / Search API（Spotify・YouTube Music はサーバー側で取得して iTunes で照合） |
| テスト                 | Vitest＋Testing Library（画面は jsdom）。DB・RLS は使い捨て Postgres で統合テスト          |
| CI                     | GitHub Actions（lint・typecheck・format:check・test:coverage・build）、Codecov             |

ランニングコストは月0円が目標です。有料サービスが必要になる変更は、先に Issue で相談してください。

## ディレクトリ

| パス                   | 内容                                                                              |
| ---------------------- | --------------------------------------------------------------------------------- |
| `src/app/(app)/`       | ログイン後の画面。各画面の更新処理は同じ階層の `actions.ts`（Server Actions）     |
| `src/app/api/`         | `export` `import` `health`（Supabase の一時停止対策で Vercel Cron が週1回呼ぶ）   |
| `src/app/welcome/`     | 初回チュートリアル                                                                |
| `src/app/help/`        | ヘルプ                                                                            |
| `src/app/(legal)/`     | 利用規約・プライバシーポリシー                                                    |
| `src/components/`      | 共通コンポーネントと CSS Modules                                                  |
| `src/lib/`             | 純粋関数とデータ処理。テストは同じ場所に `*.test.ts`                              |
| `src/db/schema.ts`     | Drizzle のスキーマと RLS ポリシー                                                 |
| `supabase/migrations/` | Supabase に適用する SQL（Drizzle 生成＋手書きの関数・トリガー）                   |
| `design/`              | UI モックアップとアイコンの原本                                                   |
| `docs/`                | 要件・実装計画・画面仕様・デザインシステム・未決事項・運用の手引き（下の表を参照） |

## 開発環境のセットアップ

### 必要なもの

- Node.js 24（CI と同じ）と npm
- 開発用の Supabase プロジェクト（無料プランで可。本番とは分ける）
- Google Cloud の OAuth クライアント（ログイン用）
- Docker（DB・RLS のテストを手元で走らせる場合）

### 手順

1. 依存関係を入れる

   ```bash
   git clone https://github.com/Laplusdestiny/setlistic.git
   cd setlistic
   npm ci
   ```

2. `.env.example` を `.env.local` にコピーして値を入れる（`.env.local` はコミットしない）
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`：開発用 Supabase の API URL と公開用キー
   - `DATABASE_URL`：マイグレーション専用の直接接続
   - `YOUTUBE_API_KEY`：任意（未設定でも YouTube Music の登録は動く）
   - `CRON_SECRET`：本番用。手元では空でよい

3. 開発用 Supabase を準備する
   - `supabase/migrations/` の SQL を番号順に適用する（SQL Editor に貼る、など）
   - Authentication → Sign In / Providers で Google を有効にし、OAuth クライアントを設定する（Google 側の承認済みリダイレクト URI は `https://<project>.supabase.co/auth/v1/callback`）
   - Authentication → URL Configuration の Redirect URLs に `http://localhost:3000/**` を追加する
   - Authentication → Auth Hooks で「Before User Created」に `public.hook_before_user_created` を設定する
   - 自分の Google アカウントを許可リストに入れる（招待制のため、入れないとログインできない）

     ```bash
     printf '%s' 'you@example.com' | tr 'A-Z' 'a-z' | sha256sum
     ```

     ```sql
     insert into public.allowed_emails (email_hash) values ('<上で出た64文字>');
     ```

   - 招待の管理画面を使うなら、ログイン後に `insert into public.app_admins (user_id) values ('<ユーザーID>');` で管理者にする

4. 開発サーバーを起動して http://localhost:3000 を開く

   ```bash
   npm run dev
   ```

詳しい設定と本番の運用は [`docs/operations.md`](docs/operations.md) を参照してください。

## ビルドとチェック

```bash
npm run dev            # 開発サーバー
npm run build          # 本番ビルド
npm run start          # ビルドしたものを起動
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier（直すときは npm run format）
npm test               # Vitest
npm run test:coverage  # カバレッジ付き（CI と同じ。coverage/lcov-report/index.html に HTML が出る）
npm run db:generate    # src/db/schema.ts から SQL を生成
```

DB・RLS のテストは、`TEST_DATABASE_URL` を付けたときだけ走ります。使い捨ての Postgres に向けてください（本番の Supabase には絶対に向けない）。

```bash
docker run -d --rm --name setlistic-pg -e POSTGRES_PASSWORD=pw -p 54329:5432 postgres:17
TEST_DATABASE_URL=postgres://postgres:pw@localhost:54329/postgres npm test
```

## 修正の PR の出し方

1. **Issue を確認・作成する**：対応する Issue がなければ先に作る。仕様に迷う点や `docs/open-questions.md` で未決の点は、着手前に Issue で相談する
2. **ブランチを切る**：`main` から `feat/...` `fix/...` `docs/...` `chore/...` など（例：`feat/issue-19-random-slot`）
3. **実装する**
   - ロジックは `src/lib` の純粋関数にしてユニットテストを書く。Server Actions・API・画面にもテストを書く（カバレッジ約99%を維持している）
   - DB を変えるときは `docs/operations.md` の「DB マイグレーション」の手順で SQL を作り、RLS・関数のテストを `src/db/rls.test.ts` に足す
   - 運用手順が変わったら `docs/operations.md` も更新する
   - 秘密情報（Supabase のキーなど）はコミットしない。新しい環境変数は `.env.example` にキー名だけ置く
4. **コミットする**：Conventional Commits の接頭辞＋日本語の要約（例：`feat: タグ入力中に、過去に作ったタグを候補として表示する`）
5. **手元でチェックを通す**：`npm run lint`・`npm run typecheck`・`npm run format:check`・`npm test`（CI と同じ内容）
6. **`main` へ PR を出す**：本文で Issue を参照する（例：`Closes #31`）。画面を変えたときはスクリーンショットを付ける
7. **CI とレビューを確認する**：GitHub Actions が通り、Codecov のコメントでカバレッジが下がっていないことを確認してからマージする

コード・コメント・コミットメッセージ・PR・ドキュメントは日本語で書きます（識別子は英語）。守るべきルールの詳細は [`CLAUDE.md`](CLAUDE.md) にまとまっています。

## ドキュメント

| パス                                                         | 内容                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                     | 開発の前提・決定事項・必ず守るルール（Claude Code 向け）   |
| [`docs/requirements.md`](docs/requirements.md)               | 要件定義書                                                 |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | フェーズ別の実装計画と受け入れ条件（MVP は実装済み）       |
| [`docs/screens.md`](docs/screens.md)                         | 画面一覧と画面ごとの仕様                                   |
| [`docs/design-system.md`](docs/design-system.md)             | 色・フォント・角丸・コンポーネントの規則                   |
| [`docs/open-questions.md`](docs/open-questions.md)           | 未決事項と決定済みの事項                                   |
| [`docs/operations.md`](docs/operations.md)                   | 運用の手引き（環境変数・招待・マイグレーション・独自ドメインなど） |
| [`design/`](design/)                                         | UI モックアップ（スマホ・PC）とアプリアイコンの原本        |
