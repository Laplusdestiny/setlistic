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
- 手動で試す：`curl -H "Authorization: Bearer $CRON_SECRET" https://setlistic.laplusdestiny.com/api/health` → `{"ok":true,...}`
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

## テストとカバレッジ（Codecov）

CI（GitHub Actions）が、push と PR のたびに `npm run test:coverage` を実行し、結果（`coverage/lcov.info`）を **Codecov** に投稿する。PR には、カバレッジの差分とコンポーネント別の数字がコメントされる。

- 設定：`codecov.yml`（コンポーネント：ロジック／DBスキーマ／サーバー処理／画面・部品）。今はステータスを参考表示にしてあり、CI は落とさない。目標を決めたら `informational` を外して `target` を設定する
- Secrets：`CODECOV_TOKEN`（GitHub → Settings → Secrets and variables → Actions）。無い場合（フォークからのPRなど）は、投稿をスキップして CI は通る
- 手元で見る：`npm run test:coverage`（DBのテストも含めるなら、`TEST_DATABASE_URL` を付けて実行。`coverage/lcov-report/index.html` にHTMLが出る）
- 計測の対象は `src/` の全ファイル（未テストの画面も数字に出す）。純粋関数（`src/lib`）は高い水準を保つ方針

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
4. 独自ドメイン（`setlistic.laplusdestiny.com`）が、Supabase の Site URL / Redirect URLs に入っている（「独自ドメイン」の節）

### 1人を招待する手順（アプリの「招待の管理」画面）

設定 →「招待の管理（友人を招待する）」（管理者のオーナーにだけ表示される）。

1. 相手の **Google アカウントのメールアドレス**を入力し、必要なら自分用のメモ（例：「大学の友人」）を書いて「招待する」
   - メールアドレスは保存されない。DB 関数の中でハッシュ（小文字化 → SHA-256）にされ、判定用の値だけが残る
2. 表示される**案内文**を、「案内文をコピー」または「共有する」で相手に送る（アプリのURLと、ログインの仕方、iPhone のホーム画面への追加の仕方が書いてある）
3. 相手が、登録したメールの Google アカウントでログインすると、一覧が「まだログインしていません」から「利用中（最終ログイン日）」に変わる

画面が使えないとき（手動で行う場合）：
```bash
printf '%s' 'friend@example.com' | tr 'A-Z' 'a-z' | sha256sum   # 小文字にしてからハッシュ
```
```sql
insert into public.allowed_emails (email_hash) values ('<上で出た64文字>');
```

### 招待をやめる（アクセスを止める）

「招待の管理」の一覧から：
- **まだログインしていない人**：「招待を取り消す」
- **利用中の人**：「アクセスを止める」。**その人のアカウントと全データも削除される**（許可リストから消すだけでは、すでに作られたアカウントはログインできてしまうため）。必要なら、先に相手にエクスポートしてもらう
- 自分自身は取り消せない

### 管理者の追加（オーナー以外にも招待をさせたいとき）

管理者は `public.app_admins` のユーザーID。Supabase の SQL Editor で `insert into public.app_admins (user_id) values ('<ユーザーID>');`（ユーザーIDは Authentication → Users で確認）。管理操作の DB 関数は、呼び出したユーザーが管理者かを必ず検査する。

### 知っておくこと

- 各ユーザーのデータは完全に分かれている（友人どうしで曲リストは共有されない。共有機能は GitHub Issue #6）
- 運営者は、データベースの管理画面から技術的には全ユーザーのデータを見られる。プライバシーポリシーにそう書いてある範囲で、必要なとき以外は見ない
- 無料プランの目安：Supabase Auth は月間5万人まで、データベースは500MB。数十人・数万曲の規模なら十分。Vercel Hobby は非商用が条件（友人との利用は問題ない範囲）

## 登録できる曲数の上限

1人あたり **2,000曲**。DB のトリガー `enforce_song_limit`（曲の追加前に必ず検査）で強制するので、1曲の登録・まとめて登録・インポートのどれでも超えられない。上限に達すると、登録画面に案内が出て、インポートは全体が取り消される。設定画面で、自分の登録曲数 / 上限を確認できる。

- 上限の値は DB の関数 `max_songs_per_user()` の1か所だけ。変えるときは、この関数を新しい値で置き換えるマイグレーションを作る（利用規約の記載「2,000曲」も合わせて直す）
- 目安：一覧は全曲を1画面で扱う作りで、1,000曲で1秒以内を確認済み。無料枠（DB 500MB）に対して、数十人が上限まで使っても足りる

## 独自ドメイン（setlistic.laplusdestiny.com）

正規URLは `https://setlistic.laplusdestiny.com`（コード上は `src/lib/site.ts` の `SITE_ORIGIN`。OGP の絶対URLと、Spotify などへ名乗る User-Agent に使う）。`setlistic.vercel.app` へのアクセスは、`vercel.json` の `redirects` で独自ドメインへ 308 転送する。ただし `/api/health` は転送しない（Vercel Cron が転送先を追わずに終わるのを避けるため）。プレビュー（`setlistic-*-laplus-destiny.vercel.app`）は転送しない。

設定する場所：

1. **DNS**（`laplusdestiny.com` を管理しているサービス）：`setlistic` の CNAME を、Vercel の Domains 画面に表示される値（例：`xxxx.vercel-dns-017.com` または `cname.vercel-dns.com`）に向ける
2. **Vercel**：Project → Settings → Domains に `setlistic.laplusdestiny.com` を追加し、Production に割り当てる。「Valid Configuration」になり、SSL 証明書が発行されたことを確認する
3. **Supabase**：Authentication → URL Configuration
   - Site URL：`https://setlistic.laplusdestiny.com`
   - Redirect URLs：`https://setlistic.laplusdestiny.com/**`（`setlistic.vercel.app` は転送されるので不要。消してよい）
4. **Google Cloud**：OAuth クライアントの「承認済みのリダイレクト URI」は Supabase のコールバックのままでよい（変更不要）。OAuth 同意画面の「承認済みドメイン」とアプリのホームページ・プライバシーポリシーのURLを使っているなら、`laplusdestiny.com` と `https://setlistic.laplusdestiny.com/privacy` などに合わせる
5. **確認**：`curl -sI https://setlistic.vercel.app/` が `308` で `location: https://setlistic.laplusdestiny.com/` を返す。独自ドメインで Google ログインでき、ログイン後も独自ドメインのままである。ホーム画面に追加済みの端末は、独自ドメインで追加し直す（PWA は URL ごとに別物になるため）

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
