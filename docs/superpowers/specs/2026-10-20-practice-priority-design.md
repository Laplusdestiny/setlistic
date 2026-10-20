# 練習の優先順位（Issue #11）設計

## 目的

歌いたい曲・練習中の曲に練習の優先順位を付け、カラオケの店で「今日たくさん練習するべき曲」をすぐ見つけられるようにする。

成功の基準：ホームで「練習する」チップを1回押すと、優先度を付けた曲が 高 → 中 → 低 の順に並ぶ。

## 決めたこと

- 優先度は **3段階（高・中・低）＋未設定**
- 優先度は**「歌える度」タグと連動させない**。どの曲にも付けられ、練習が終わったら利用者が自分で「なし」に戻す
  - 連動には「どのタグが練習中か」をシステムが知る仕組み（タグへの印、または名前での判定）が必要で、管理が複雑になるため見送った。不便が分かったら、名前で判定して自動で外す方式を後から足せる
- 「練習中」タグと組み合わせた検索（タグ＋優先度＋優先度順）で、練習中の曲だけを高い順に並べることもできる

## データ

### 列

`songs.practice_priority smallint`（null 可）

| 値 | 意味 |
| --- | --- |
| 1 | 高 |
| 2 | 中 |
| 3 | 低 |
| null | 未設定 |

- CHECK 制約 `songs_practice_priority_check`：`practice_priority between 1 and 3`
- 数字が小さいほど優先度が高い。昇順の並べ替えがそのまま「高い順」になる
- 索引は付けない（1人2,000曲が上限で、`search_songs` の中で並べ替えれば足りる）
- Drizzle のスキーマ（`src/db/schema.ts`）に列と CHECK を足し、マイグレーション `supabase/migrations/0013_practice_priority.sql` を作る

### 書き込み

- 曲の詳細から保存するとき：`register_song` / `update_song` が受け取る JSON に `practice_priority` を足す（`song_key` と同じ扱い）。範囲外の値は検証（`src/lib/songs/validate.ts`）で弾く
- まとめて編集：既存の DB 関数 `bulk_edit_song_tags` に引数 `p_set_priority boolean DEFAULT false` と `p_priority smallint DEFAULT NULL` を足す（`DROP` → `CREATE`）
  - タグの変更と同じ1回の呼び出し・同じトランザクションで適用する。他人の曲が混ざっていれば全体が失敗する（`P0002`）という今の挙動もそのまま引き継ぐ
  - `p_set_priority` が true のときだけ `practice_priority = p_priority` と `updated_at = now()` を更新する。`p_priority` が null なら未設定に戻す
  - 戻り値（対象にした曲の数）は今のまま

### 検索・並べ替え

`search_songs(p jsonb)` を作り直す（`DROP` → `CREATE`。0006 の版を引き継ぐ）。

- 引数に `priority` を足す

  | 値 | 条件 |
  | --- | --- |
  | `high` | `practice_priority = 1` |
  | `mid` | `practice_priority <= 2`（中以上） |
  | `set` | `practice_priority IS NOT NULL` |
  | なし | 絞り込まない |

- 並べ替えキー `priority_asc` を足す：`practice_priority ASC NULLS LAST`、そのあと `created_at DESC`
- 返す行に `practice_priority` を含める

アプリ側：

- `src/lib/songs/sort.ts`：`SORT_KEYS` に `priority_asc`、ラベル「練習の優先度が高い順」、`orderSpecs` に `{ column: "practice_priority", ascending: true, nullsFirst: false }` と `created_at desc`
- `src/lib/search/conditions.ts`：`SearchConditions` に `priority: PriorityFilter | null`（`"high" | "mid" | "set"`）。URL パラメータは `priority`。`search_songs` への引数にも渡す。保存した検索条件にもそのまま入る
- `src/lib/songs/queries.ts`：検索結果の型に `practicePriority: number | null`

### データの出入り

- JSON エクスポート／インポート：曲に `practice_priority`（数値）を足す。インポートで 1〜3 以外なら null にする
- CSV エクスポート：列「練習の優先度」を足し、値は「高」「中」「低」、未設定は空欄
- アカウント削除・管理者によるアクセス停止：`songs` の列なので今の処理のままで消える

## 画面

表示用のラベルは `src/lib/songs/priority.ts` にまとめる（`PRIORITY_LABELS = { 1: "高", 2: "中", 3: "低" }`、値の検証関数など）。

### 曲の詳細（`src/components/SongDetail.tsx`）

- 表示：「キー」の近くに「練習の優先度」の行を置き、「高」「中」「低」「—」のどれかを出す
- 編集：「なし・低・中・高」の4つのボタンが横に並ぶ切り替え。歌唱記録の「歌いやすさ」のボタンと同じ作り（`fieldset` ＋ `legend`、各ボタンに `aria-pressed`）。保存は今のフォームと一緒に行う

### ホームの一覧（`src/app/(app)/SetList.tsx`）

- **バッジ**：優先度が付いた曲に「優先：高」などのバッジを出す。キーのバッジと同じ見た目で並べる
  - 設定の「一覧に表示する項目」に「練習の優先度」を足す（`list_columns` の値 `"priority"`）
  - `user_settings.list_columns` の既定値を `'["key","tags","priority"]'` に変える。既存ユーザーの保存済みの値は書き換えない
- **「練習する」チップ**：一覧の上のチップの列で「すべて」のすぐ右に固定で置く

  ```
  [すべて] [練習する] [十八番] [歌える] [練習中] [歌いたい] [★ 保存した条件] …
  ```

  - 押すと、今の条件に `priority: "set"` と `sort: "priority_asc"` を入れる。ほかの条件（タグのチップなど）はそのまま残すので、「練習する」＋「練習中」のように組み合わせられる
  - `priority === "set"` かつ `sort === "priority_asc"` のとき押された状態（`aria-pressed="true"`）。もう一度押すと `priority` と `sort` を外し、設定の既定の並び順に戻る
  - 優先度が付いた曲が1曲もないときは出さない。件数は、ホームの読み込みの `Promise.all` に、`practice_priority` が null でない曲の件数を `count: "exact", head: true` で取る問い合わせを足して得る

### 検索の条件フォーム（`src/components/ConditionsForm.tsx`。検索画面と PC の絞り込みパネルで共通）

- 「練習の優先度」の欄を足す：「高だけ・中以上・設定あり」のチップから1つ選ぶ。「直近の歌いやすさ」と同じ作りで、押したチップをもう一度押すと指定なしに戻る
- 絞り込み中の説明（`describeConditions`）に「練習の優先度：高だけ」などを出し、`hasConditions` / `countConditions` でも条件として数える
- 並べ替えのメニューに「練習の優先度が高い順」を足す

### まとめて編集（`src/app/(app)/bulk/BulkEditScreen.tsx`）

- タグの編集の下に「練習の優先度をまとめて変える」欄：「変えない・なし・低・中・高」から選ぶ（既定は「変えない」）
- 適用すると、`bulkEditTagsAction`（`bulk/actions.ts`）が `bulk_edit_song_tags` に優先度の引数も渡す。タグの変更と優先度の変更を同時に指定したときは、両方を一度に適用する
- タグも優先度も変えないときは適用ボタンを押せない（今の `nothingToDo` に優先度を含める）
- 見出しは「タグ・優先度の一括変更」、説明文も優先度に触れる形に直す

### ヘルプ（`src/app/help/page.tsx`、節の id は `src/lib/help.ts`）

- 節の id `practice` を `HELP_SECTIONS` に足し、「タグ」の節の次に「練習の優先度」の節を置く：付け方（曲の詳細・まとめて編集）、「練習する」チップ、検索での絞り込み、練習が終わったら「なし」に戻すこと
- チュートリアルは変えない

## エラーの扱い

- 範囲外の値は、アプリの検証と DB の CHECK の両方で弾く。Server Action はほかの項目と同じ形式でエラーを返す
- まとめて編集で他人の曲の ID が混ざっていたら、今と同じく全体を失敗させる（`P0002`）。画面には今と同じ「選んだ曲の一部が見つかりませんでした」を出す

## テスト

- `src/db/rls.test.ts`（使い捨て Postgres）
  - 他人の曲の優先度は `update` でも `bulk_edit_song_tags` でも変えられない
  - `bulk_edit_song_tags`：`p_set_priority` が false なら優先度は変わらない、true ＋ null で未設定に戻る
  - CHECK 制約で 0 と 4 が弾かれる
  - `search_songs`：`priority` の3種類の絞り込み、`priority_asc` の順番（高 → 中 → 低 → 未設定、同じ優先度の中は追加が新しい順）
- `src/lib/songs/sort.test.ts` / `src/lib/search/conditions.test.ts`（URL との相互変換を含む）/ `src/lib/songs/validate.test.ts` / `src/lib/data/import.test.ts` / `src/lib/data/csv.test.ts` / `src/lib/songs/priority.test.ts`
- 画面テスト：`SongDetail`（切り替えと保存）、`SetList`（バッジ、「練習する」チップの表示・非表示・押した状態・解除）、`SearchScreen`（欄と並べ替え）、`BulkEditScreen`（適用）
- `bulk/actions.test.ts` / `src/lib/songs/bulk-tags.test.ts`：優先度の引数の渡し方（「変えない」なら `p_set_priority: false`）と、範囲外の値を弾くこと

## ドキュメント

- `docs/open-questions.md` の「決定済み」に、この設計の要点（3段階、タグと連動しない、「練習する」チップ）を追記する
- `CLAUDE.md` の「決定済みの仕様」に1行足す

## 対象外

- 「歌える度」タグとの自動連動
- 通し順位（1, 2, 3…）での並べ替え
- 練習の進み具合の記録（歌唱記録 `sing_logs` で足りる）
