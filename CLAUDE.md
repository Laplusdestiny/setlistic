# CLAUDE.md — Setlistic

## 返答の言語

- オーナーへの返答・報告・質問は**日本語**で書く
- コミットメッセージ、PR の本文、コード中のコメント、ドキュメントも日本語（既存に合わせる）。識別子は英語

## プロジェクト概要

Setlistic は、カラオケで歌える曲を自分で登録・タグ付けし、店でスマホからその場で多観点で探せるWebアプリ。PCではまとめて登録・整理する。

- 公開URL：`setlistic.laplusdestiny.com`（Vercel の `setlistic.vercel.app` は `vercel.json` の `redirects` で独自ドメインへ転送する。正規URLは `src/lib/site.ts`）
- 利用者：オーナー＋招待制の友人数十人まで。一般公開はしない
- 提供形態：レスポンシブWeb（スマホはホーム画面追加でPWA風に使う）＋PC用3ペインレイアウト
- UI言語：日本語のみ

詳細は `docs/requirements.md`。迷ったら要件定義書が正、ただし `docs/open-questions.md` に食い違いの整理と決定済み事項がある。運用手順は `docs/operations.md`。

## 現在の状況

- MVP（`docs/implementation-plan.md` の Phase 0〜6）は実装済み。その後、タグ候補・タグ一括変更・招待の管理画面・初回チュートリアルとヘルプ（#18）・曲数上限・OGP・カラオケ機種タグ・Spotify / YouTube Music からの登録・テストとカバレッジ（Codecov）を追加した
- これからの機能は **GitHub Issues** で管理している（共有 #6、ジャケット画像 #7、ダークテーマ #3、かな揺れ #2、Siri ショートカット #5、カスタム項目検索 #9、練習の優先順位 #11、分析ページ #1 など）。着手前に `gh issue view <番号>` で内容を確認する

## 技術構成

| 層 | 採用 |
| --- | --- |
| フロント・API | Next.js 16（App Router, TypeScript）、React 19。Vercel（Hobby、リージョン `hnd1`）にデプロイ |
| DB | Supabase（PostgreSQL、無料プラン、Tokyo） |
| 認証 | Supabase Auth。**Google OAuth のみ**。招待制（許可リスト＋Before User Created フック） |
| ORM / マイグレーション | Drizzle ORM（`drizzle-orm/supabase` のロール・`authUid` でRLSポリシーも定義）。SQL は `supabase/migrations/` |
| 曲情報 | iTunes Lookup / Search API。Spotify・YouTube Music の共有URLは、取得元の情報から iTunes Search で Apple Music の表記にそろえる |
| テスト | Vitest（＋Testing Library、画面は jsdom）。DB・RLS は使い捨て Postgres で統合テスト |
| CI | GitHub Actions（lint・typecheck・format:check・test:coverage・build）、Codecov |

ランニングコストは月0円が目標。有料サービスや有料プランが必要になる設計は提案前に相談すること。

**Next.js 16 は学習データと API・規約が違う**（例：middleware ではなく `src/proxy.ts`）。コードを書く前に `AGENTS.md` の指示どおり `node_modules/next/dist/docs/` の該当ガイドを読む。

## 必ず守ること

- **認証はSupabase無料プランで使える方式だけ**。メール送信が必要な方式（メール＋パスワード、マジックリンク）、SMS、Appleでサインインは実装しない。ソーシャルログインを足す場合もGitHubなど無料のものに限る
- **全テーブルにRLS**。各行は `user_id` を持ち、本人の行だけ読み書きできる。ユーザーデータの読み書きは、ログインユーザーのJWTで動く Supabase クライアント経由で行い、RLSが効く経路を使う。サービスロールキーや直接のDB接続（RLSを素通りする）をユーザー操作の処理に使わない。マイグレーション用途に限る
  - サーバー側の入口は `requireUser()`（`src/lib/supabase/user.ts`）。JWT付きクライアントとユーザーIDを返す
  - 複数行にまたがる処理は DB 関数（`supabase.rpc(...)`）にする。関数は **`SECURITY INVOKER`** で RLS を効かせ、`user_id` は引数で受けず `auth.uid()` を使う
  - `SECURITY DEFINER` は Auth フックと管理者用関数（`admin_*`）だけ。管理者用関数は最初に呼び出し元が `app_admins` にいるかを必ず検査する
- **曲情報は登録時に一度だけ取得**してDBに保存する。表示のたびに外部APIを呼ばない。iTunes Search API は約20回/分が目安なのでデバウンスする。Spotify / YouTube の取得はサーバー側だけ（`src/lib/songs/source-fetch.ts`）
- **ジャケット画像は表示しない**（Issue #7 で検討中）。`artwork_url` は文字列として保存だけする
- **試聴音源（previewUrl）は使わない**
- 画面上で「Apple Music」等のApple商標を自前のロゴや見出しに使わない。リンク元の表記は文字だけにとどめる
- メモ欄の歌詞全文掲載は前提にしない（将来の共有機能でメモを共有対象外にするため、`memo` は共有と分けて扱える設計にする）
- アカウント削除（`delete_my_account`）・管理者によるアクセス停止で、そのユーザーの全データが消えること。テーブルを足したら削除・エクスポート・インポートの対象にも含める
- メールアドレスはアプリのテーブルに保存しない。許可リスト `allowed_emails` は小文字化した SHA-256 だけを持つ
- 登録曲数の上限（1人2,000曲）は DB のトリガー `enforce_song_limit` と関数 `max_songs_per_user()` で強制している。値を変えるときは利用規約の記載も直す

## 決定済みの仕様（主なもの）

- 習熟度は列で持たず、タグ（「歌える度」グループ：十八番・歌える・練習中・歌いたい）に一本化
- タググループ（`tag_groups`）と別名（`tag_aliases`）を使う。タグ名は NFKC で正規化（かなの揺れ吸収はしない。Issue #2）
- テーマはライトのみ（Issue #3）
- `/add?url=` は URL 欄に入った状態で開くだけ。自動取得・自動保存はしない
- 並べ替えは↑↓ボタン。タグだけはドラッグ（スマホは長押ししてから移動）でも並べ替え・グループの移動ができる（Issue #32）
- エクスポートは JSON（再インポート用）と CSV。インポートは追加のみ

その他は `docs/open-questions.md` の「決定済み」を参照。新しく決めたことはそこに追記する。

## ディレクトリ

| パス | 内容 |
| --- | --- |
| `src/app/(app)/` | ログイン後の画面（ホーム、`add` `bulk` `songs/[id]` `search` `tags` `settings` `admin/invites`）。各画面の更新処理は同じ階層の `actions.ts`（Server Actions） |
| `src/app/api/` | `export` `import` `health`（Vercel Cron が週1回呼ぶ Supabase 一時停止対策） |
| `src/app/welcome/` | 初回チュートリアル（`?step=` で手順。完了は `user_settings.tutorial_completed_at`） |
| `src/app/help/` | ヘルプ（ログイン不要）。節の id は `src/lib/help.ts` |
| `src/app/(legal)/` | 利用規約・プライバシーポリシー（草案） |
| `src/components/` | 共通コンポーネントと CSS Modules |
| `src/lib/` | 純粋関数とデータ処理（`songs` `tags` `search` `data` `supabase` `auth`）。テストは同じ場所に `*.test.ts` |
| `src/db/schema.ts` | Drizzle のスキーマと RLS ポリシー |
| `supabase/migrations/` | 適用する SQL（Drizzle 生成＋手書きの関数・トリガー） |
| `design/` | モックアップとアイコンの原本 |
| `docs/` | 要件・計画・画面仕様・デザインシステム・未決事項・運用 |

## デザイン

- 見た目の正は `design/mockups/` のHTMLと `docs/design-system.md`。色・余白・角丸はモックの値をそのまま使う。モックにない画面は既存画面の部品と CSS 変数に合わせて起こす
- モックは独自テンプレート形式（`{{変数}}`、`<sc-for>`、`class Component extends DCLogic`）。そのままでは動かないので、マークアップとインラインスタイル、末尾スクリプトのサンプルデータを読み取って React コンポーネントに起こす
- スタイルは CSS Modules（`*.module.css`）と `globals.css` のトークン
- モチーフは「紙のセットリスト」。リストの見出しや詳細のラベルに手書き風フォント（Klee One）で `SET LIST` を置く。曲番号（`01` `02`）は振らない（一覧は並び替え・絞り込みで順序が変わり番号に意味がなく、100曲以上で桁があふれるため。2026-10-12 決定）
- タップ領域は最小44px。フォーカスリングとラベル（視覚的に隠したlabel含む）を省かない
- iPhone Safari：入力欄の文字は16px以上（ズーム防止）、セーフエリア対応、横はみ出しを出さない
- アイコンは `design/icon/`。`icon.svg` が原本（角丸なし・全面背景）。PWA manifest には `png/icon-192.png` `png/icon-512.png` と maskable版を、Apple touch icon には `png/icon-180.png` を使う

## 開発の進め方

- 作業は `feat/...` `fix/...` などのブランチで行い、`main` へ PR を出す。Issue に対応する PR は本文で Issue を参照する
- コミットは Conventional Commits の接頭辞＋日本語の要約（例：`feat: タグ入力中に、過去に作ったタグを候補として表示する`）。区切りのよい単位でコミットし、オーナーに報告する
- 仕様に迷う点・`docs/open-questions.md` に未決として残っている点は、着手前にオーナーへ確認する。勝手に決めない
- 曲URLパーサー、タグ正規化、検索条件→クエリ変換などのロジックは `src/lib` の純粋関数にしてユニットテストを書く。Server Actions・API・画面にもテストを書く（カバレッジは約99%を維持している）
- DB を変えたら `docs/operations.md` の「DB マイグレーション」の手順で SQL を作り、RLS・関数のテストを `src/db/rls.test.ts` に足す
- 運用手順が変わったら `docs/operations.md` も更新する
- 利用者に見える変更を入れる PR では、`release-bump` スキル（`.claude/skills/release-bump/SKILL.md`）の手順で `package.json` の version を上げ、ヘルプの更新履歴（`src/lib/release-notes.ts`）に利用者向けの説明を足す。バージョンは 0.x.y（新機能・仕様変更は minor、修正だけは patch、見えない変更は据え置き。1.0 などの major はオーナーが決める）
- 秘密情報（Supabaseのキー等）はコミットしない。`.env.example` にキー名だけ置く

### コマンド

```bash
npm run dev            # 開発サーバー
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier（直すときは npm run format）
npm test               # Vitest
npm run test:coverage  # カバレッジ付き（CI と同じ）
npm run db:generate    # schema.ts から SQL を生成

# DB・RLS のテストも走らせる（本番の Supabase には向けない）
docker run -d --rm --name setlistic-pg -e POSTGRES_PASSWORD=pw -p 54329:5432 postgres:17
TEST_DATABASE_URL=postgres://postgres:pw@localhost:54329/postgres npm test
```

PR を出す前に lint・typecheck・format:check・test を通す（CI と同じ内容）。

## 用語

| 用語 | 意味 |
| --- | --- |
| セトリ | ユーザーの曲一覧（ホーム画面） |
| 歌唱記録 | 「今日歌った！」で残す記録。歌った日・歌いやすさ（1〜5）・メモ |
| 基本項目 | キー・タグ・メモなど全員共通の項目（習熟度はタグで表す） |
| カスタム項目 | ユーザーが追加する項目（テキスト／数値／選択肢／日付／チェック） |
| 十八番 | 得意曲を表すタグの例（「歌える度」グループ） |
| 管理者 | `app_admins` に登録されたユーザー。招待の管理画面を使える |
