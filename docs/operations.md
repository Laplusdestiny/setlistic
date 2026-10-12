# 運用の手引き

Setlistic を運用するときの手順と、確認の仕方。月0円の構成（Vercel Hobby・Supabase 無料プラン）を前提にしている。

## 構成と環境変数

| どこに | 変数 | 内容 |
| --- | --- | --- |
| Vercel（全環境） | `NEXT_PUBLIC_SUPABASE_URL` | Supabase の API URL（公開してよい） |
| Vercel（全環境） | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase の公開用キー（RLS が効く） |
| Vercel（Production） | `CRON_SECRET` | `/api/health` を保護する秘密。Vercel Cron が `Authorization: Bearer` で付ける |
| ローカル（`.env.local`、コミットしない） | 上記＋ `DATABASE_URL`（マイグレーション専用） | `.env.example` 参照 |

サービスロールキーは使わない（ユーザー操作に使うと RLS を素通りするため）。アカウント削除も、本人の行だけを消す DB 関数 `delete_my_account` で行う。

## Supabase 無料プランの一時停止対策

無操作が続くと（目安：7日間）プロジェクトが一時停止される。対策として、Vercel Cron が **週1回（毎週月曜 03:00 UTC）** `/api/health` を呼び、DB 関数 `health_ping()`（現在時刻を返すだけ）を実行する。設定は `vercel.json` の `crons`。

- 動作の確認：Vercel ダッシュボード → Project → Settings → Cron Jobs で、実行履歴が見られる。ログは `vercel logs --project setlistic --scope laplus-destiny`
- 失敗すると 503 を返し、ログに `[health] DB に接続できませんでした` が出る（`--level error` で絞れる）
- 手動で試す：`curl -H "Authorization: Bearer $CRON_SECRET" https://setlistic.vercel.app/api/health` → `{"ok":true,...}`
- 万一停止したら：Supabase ダッシュボードの `setlistic` プロジェクトで「Restore project」。停止から一定期間内なら、データはそのまま戻る。復旧までアプリは開けない
- Vercel Hobby の Cron は1日1回までの制限があるが、週1回なので問題ない

## エラーの確認（監視の最低限）

専用の監視サービスは使わない。Vercel のログで足りる。

```bash
vercel logs --project setlistic --scope laplus-destiny            # 直近のリクエスト
vercel logs --project setlistic --scope laplus-destiny --level error   # エラーだけ
```

画面で予期しないエラーが起きると、日本語のエラー画面（「エラー番号」付き）が出て、ログに `[app error]` が残る。

## データのバックアップ

無料プランには自動バックアップがない。設定画面の「データ → JSONでエクスポート」を、月1回程度とっておく（再インポート可能）。

## DB マイグレーション

1. `src/db/schema.ts` を変更して `npm run db:generate`（関数などは `npx drizzle-kit generate --custom --name <名前>` で空のSQLを作って書く）
2. `supabase/migrations/` の SQL を、Supabase に適用する（SQL Editor に貼る、または MCP の `apply_migration`）
3. RLS・関数のテストは、使い捨ての Postgres で実行する：
   ```bash
   docker run -d --rm --name setlistic-pg -e POSTGRES_PASSWORD=pw -p 54329:5432 postgres:17
   TEST_DATABASE_URL=postgres://postgres:pw@localhost:54329/postgres npm test
   ```
   CI でも同じテストが走る。本番の Supabase には向けない。

## 招待（利用できる人の追加）

### 事前に確認しておくこと（初回だけ）

1. **Google の OAuth 同意画面が「テスト」状態でないか**：Google Cloud Console → Google Auth Platform（OAuth 同意画面）。「テスト」のままだと、登録したテストユーザー以外（最大100人）はログインできない。招待する人を、テストユーザーとして追加するか、公開ステータスを「本番環境」にする（メールとプロフィールだけの権限なら審査は不要）
2. **「Before User Created」フックが有効か**：Supabase ダッシュボード → Authentication → Auth Hooks。許可していない Google アカウントでログインして、「招待制です」と出て拒否されることを一度確認する
3. **利用規約・プライバシーポリシー（`/terms` `/privacy`）が確定しているか**（連絡先を含む）。招待した人は、これに同意して使う
4. 独自ドメイン（`setlistic.laplusdestiny.com`）を使うなら、Supabase の Site URL / Redirect URLs にも追加してある

### 1人を招待する手順

1. 相手の **Google アカウントのメールアドレス**を聞く（ログインに使うもの。Gmail なら通常そのアドレス）
2. 小文字にして SHA-256 を計算する：
   ```bash
   printf '%s' 'friend@example.com' | tr 'A-Z' 'a-z' | sha256sum
   ```
3. Supabase の SQL Editor で登録する（メールアドレスそのものは入れない）：
   ```sql
   insert into public.allowed_emails (email_hash) values ('<上で出た64文字>');
   ```
4. 相手に伝える：アプリのURLを開く → 「Googleでサインイン」（**登録したメールの Google アカウント**で）。iPhone は Safari の共有ボタン →「ホーム画面に追加」

### 招待をやめる（アクセスを止める）

許可リストから消すだけでは **止まらない**（フックは、アカウントを新しく作るときにだけ働くため。すでに作られたアカウントはそのままログインできる）。次の2つを行う。

1. `delete from public.allowed_emails where email_hash = '<ハッシュ>';`
2. Supabase ダッシュボード → Authentication → Users で、そのユーザーを削除（またはBan）。削除すると、そのユーザーのデータもすべて消える（相手に先にエクスポートしてもらうとよい）

### 知っておくこと

- 各ユーザーのデータは完全に分かれている（友人どうしで曲リストは共有されない。共有機能は GitHub Issue #6）
- 運営者は、データベースの管理画面から技術的には全ユーザーのデータを見られる。プライバシーポリシーにそう書いてある範囲で、必要なとき以外は見ない
- 無料プランの目安：Supabase Auth は月間5万人まで、データベースは500MB。数十人・数万曲の規模なら十分。Vercel Hobby は非商用が条件（友人との利用は問題ない範囲）

## 認証まわりの設定

- Google の OAuth クライアント：承認済みのリダイレクト URI は `https://<project>.supabase.co/auth/v1/callback`
- Supabase の Site URL / Redirect URLs：`https://setlistic.laplusdestiny.com/**`、`http://localhost:3000/**`、（Vercel プレビューを使うなら）`https://setlistic-*-laplus-destiny.vercel.app/**`

## 実機確認チェックリスト（iPhone Safari）

- [ ] ホーム画面に追加 → Setlistic のアイコンとタイトルで表示される
- [ ] ホーム画面から開く → アドレスバーのない画面で、ログインできる（Google）
- [ ] 下部のタブバー・＋ボタンがホームバーに隠れない（`viewport-fit=cover` とセーフエリア対応済み）
- [ ] 入力欄をタップしても画面がズームしない（文字サイズ16px以上にしてある）
- [ ] 暗い店内（画面の明るさを下げた状態）で、曲名・タグ・ボタンが読める（本文のコントラスト比は6:1以上）
- [ ] 曲URLの貼り付け → 取得 → 保存が3タップ程度で終わる
- [ ] 機内モードなどで通信できないとき、エラー表示が出る（真っ白にならない）

## 公開前のチェック

`docs/open-questions.md` の「公開前のチェック」を参照。特に、利用規約・プライバシーポリシー（`/terms` `/privacy`、現在は草案）の確定と、連絡先の記載。
