# 練習の優先順位（Issue #11）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 曲に練習の優先度（高・中・低・未設定）を付け、ホームの「練習する」チップ・検索の絞り込み・並べ替えで、練習するべき曲をすぐ出せるようにする。

**Architecture:** `songs.practice_priority smallint`（1=高・2=中・3=低、null=未設定）を足す。書き込みは既存の DB 関数（`register_song` / `update_song` / `bulk_edit_song_tags` / `import_data`）を広げ、読み出しは `search_songs` と `export_data` を広げる。アプリ側は `src/lib/songs/priority.ts` にラベルと検証をまとめ、検索条件・並べ替え・各画面から使う。

**Tech Stack:** Next.js 16（App Router）、React 19、Supabase（PostgreSQL）、Drizzle ORM、Vitest ＋ Testing Library

**Spec:** `docs/superpowers/specs/2026-10-20-practice-priority-design.md`

## Global Constraints

- 値は 1=高・2=中・3=低、null=未設定。DB の CHECK 制約 `songs_practice_priority_check`：`practice_priority between 1 and 3`
- 表示ラベルは「高」「中」「低」。項目名は「練習の優先度」。並べ替えのラベルは「練習の優先度が高い順」
- DB 関数は `SECURITY INVOKER`、`SET search_path = ''`、`user_id` は `auth.uid()`。`REVOKE ALL ... FROM PUBLIC, anon` と `GRANT EXECUTE ... TO authenticated` を付ける（既存の関数と同じ）
- 関数のシグネチャを変えるときは `DROP FUNCTION` → `CREATE FUNCTION`（0006 と同じやり方）。マイグレーションの文の区切りは `--> statement-breakpoint`
- コメント・コミットメッセージ・画面の文言は日本語。コミットは Conventional Commits の接頭辞＋日本語の要約。末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- タップ領域は最小44px。ボタンの押された状態は `aria-pressed`
- 各タスクの最後に `npm run lint && npm run typecheck && npm run format:check && npm test` が通ること。DB を触るタスクは `TEST_DATABASE_URL` 付きでも通すこと（CLAUDE.md の docker コマンド）

## Review Focus

1. **優先度に触れずに曲を編集・保存しても優先度が消えない**こと：曲の詳細の取得（`queries.ts` の `COLUMNS`）が `practice_priority` を読まないと、編集フォームが null で初期化され、保存で消える → Task 2・Task 3 にテスト
2. **まとめて編集でタグだけ変えても優先度が消えない**こと（`p_set_priority: false`）→ Task 1・Task 5 にテスト
3. **`priority` を含まない古い URL・保存した検索条件、`?priority=foo` のような不正な値**でも落ちず、指定なしとして扱われること → Task 2 にテスト
4. **`practice_priority` を含まない古いエクスポート JSON、範囲外（0・4・"高"）の値を含む JSON**のインポートで、エラーにならず null になること → Task 4 にテスト
5. **「練習する」チップを押したあとに並べ替えメニューで別の順を選ぶ**と、チップは押されていない状態に戻ること。もう一度押すと優先度順に戻る → Task 7 にテスト

---

### Task 1: DB（列・関数）

**Files:**
- Modify: `src/db/schema.ts`（`songs` に列と CHECK、`user_settings.list_columns` の既定値）
- Create: `supabase/migrations/0013_<drizzle が付ける名前>.sql`（`npm run db:generate` で生成）
- Create: `supabase/migrations/0014_practice_priority_functions.sql`（`npx drizzle-kit generate --custom --name practice_priority_functions`）
- Test: `src/db/rls.test.ts`

**Interfaces:**
- Produces（DB）:
  - 列 `songs.practice_priority smallint`（null 可）
  - `register_song` / `update_song`：`p_song->>'practice_priority'` を `::smallint` で保存（`update_song` は常に上書き。null を渡すと未設定）
  - `bulk_edit_song_tags(p_song_ids uuid[], p_add_tag_ids uuid[] DEFAULT '{}', p_new_tags jsonb DEFAULT '[]', p_remove_tag_ids uuid[] DEFAULT '{}', p_set_priority boolean DEFAULT false, p_priority smallint DEFAULT NULL) RETURNS integer`
  - `search_songs(p jsonb)`：入力 `p->>'priority'` が `'high' | 'mid' | 'set'`、`p->>'sort'` に `'priority_asc'`。返す列の `song_key` の次に `practice_priority smallint`
  - `export_data()`：各曲に `'practice_priority'`
  - `import_data(p jsonb)`：各曲の `practice_priority` を保存（値の検証はアプリ側の Task 4 で済ませてから渡す）
  - `user_settings.list_columns` の既定値 `'["key","tags","priority"]'::jsonb`

- [ ] **Step 1: `rls.test.ts` に失敗するテストを書く**

既存の `describe` の書き方（`as(A, ...)` でユーザーとして実行しロールバック）に合わせて、新しい `describe("練習の優先度", ...)` を足す。

```ts
it("CHECK：0 と 4 は入らない、1〜3 と null は入る");
it("他人の曲の優先度は update で変えられない（B が A の曲を更新しても 0 行）");
it("update_song：practice_priority を保存し、null で未設定に戻る");
it("bulk_edit_song_tags：p_set_priority=false なら優先度は変わらない");
it("bulk_edit_song_tags：p_set_priority=true, p_priority=1 で全曲が 1、p_priority=null で全曲が null");
it("bulk_edit_song_tags：他人の曲が混ざると P0002 で全体が失敗し、自分の曲の優先度も変わらない");
it("search_songs priority=high は 1 だけ、mid は 1・2、set は null 以外");
it("search_songs sort=priority_asc：1 → 2 → 3 → null、同じ値の中は created_at の新しい順");
it("search_songs の結果に practice_priority が入る");
it("export_data に practice_priority が出て、import_data で戻る");
it("新しいユーザーの user_settings.list_columns は [\"key\",\"tags\",\"priority\"]");
```

並べ替えのテストは、優先度 null・3・1・2・1 の曲を `created_at` をずらして入れ、返る順を ID の配列で `toEqual` する。

- [ ] **Step 2: 失敗を確認する**

Run: `TEST_DATABASE_URL=postgres://postgres:pw@localhost:54329/postgres npx vitest run src/db/rls.test.ts -t "練習の優先度"`
Expected: FAIL（`column "practice_priority" does not exist` など）

- [ ] **Step 3: `schema.ts` を変えて `npm run db:generate`**

`songs` に `practicePriority: smallint("practice_priority")`（`songKey` の次）と `check("songs_practice_priority_check", sql\`${t.practicePriority} between 1 and 3\`)`。`listColumns` の既定値を `'["key","tags","priority"]'::jsonb` に。生成された 0013 の SQL が `ADD COLUMN`・`ADD CONSTRAINT`・`SET DEFAULT` だけであることを確かめる。

- [ ] **Step 4: 0014 に関数を書く**

0006 の `register_song` / `update_song` / `search_songs` / `export_data` / `import_data` と 0008 の `bulk_edit_song_tags` を元にして、次だけを変える。

- `register_song` / `import_data`：`INSERT INTO public.songs` の列と値に `practice_priority`。シグネチャは変わらないので `CREATE OR REPLACE`
- `update_song`：`SET` に `practice_priority = (p_song->>'practice_priority')::smallint`。`CREATE OR REPLACE`
- `bulk_edit_song_tags`：`DROP FUNCTION public.bulk_edit_song_tags(uuid[], uuid[], jsonb, uuid[])` → 新しいシグネチャで `CREATE`。所有の検査（`P0002`）より後、タグの処理の後に `IF p_set_priority THEN UPDATE public.songs SET practice_priority = p_priority, updated_at = now() WHERE id = ANY (v_ids) AND user_id = v_user; END IF;`。REVOKE / GRANT も新しいシグネチャで
- `search_songs`：返す列が増えるので `DROP` → `CREATE`。`v_priority text := nullif(p->>'priority', '')`、WHERE に

  ```sql
  AND (
    v_priority IS NULL
    OR CASE v_priority
         WHEN 'high' THEN s.practice_priority = 1
         WHEN 'mid' THEN s.practice_priority <= 2
         WHEN 'set' THEN s.practice_priority IS NOT NULL
         ELSE true
       END
  )
  ```

  ORDER BY の先頭に `CASE WHEN v_sort = 'priority_asc' THEN s.practice_priority END ASC NULLS LAST,`（最後の `s.created_at DESC` はそのまま）
- `export_data`：曲の `jsonb_build_object` に `'practice_priority', s.practice_priority`。`CREATE OR REPLACE`

- [ ] **Step 5: テストが通ることを確認する**

Run: `TEST_DATABASE_URL=postgres://postgres:pw@localhost:54329/postgres npx vitest run src/db`
Expected: PASS（既存の RLS テストも含めて全部）

- [ ] **Step 6: コミット**

```bash
git add src/db/schema.ts supabase/migrations src/db/rls.test.ts
git commit -m "feat: 曲に練習の優先度の列を足し、登録・更新・一括変更・検索・エクスポートで扱う"
```

---

### Task 2: 優先度の定義・並べ替え・検索条件・読み出し

**Files:**
- Create: `src/lib/songs/priority.ts`、`src/lib/songs/priority.test.ts`
- Modify: `src/lib/songs/sort.ts`、`src/lib/songs/sort.test.ts`
- Modify: `src/lib/search/conditions.ts`、`src/lib/search/conditions.test.ts`
- Modify: `src/lib/songs/queries.ts`、`src/lib/songs/queries.test.ts`

**Interfaces:**
- Consumes: Task 1 の `search_songs` の `priority` / `priority_asc` / 返す列 `practice_priority`
- Produces:
  - `priority.ts`：`export type Priority = 1 | 2 | 3`、`export const PRIORITIES: readonly Priority[] = [1, 2, 3]`、`export const PRIORITY_LABELS: Record<Priority, string> = { 1: "高", 2: "中", 3: "低" }`、`export function parsePriority(v: unknown): Priority | null`（1・2・3 の数値だけを通し、それ以外は null）
  - `priority.ts`：`export type PriorityFilter = "high" | "mid" | "set"`、`export const PRIORITY_FILTERS: PriorityFilter[] = ["high", "mid", "set"]`、`export const PRIORITY_FILTER_LABELS: Record<PriorityFilter, string> = { high: "高だけ", mid: "中以上", set: "設定あり" }`
  - `sort.ts`：`SORT_KEYS` の末尾に `"priority_asc"`、`SORT_LABELS.priority_asc = "練習の優先度が高い順"`
  - `conditions.ts`：`SearchConditions.priority: PriorityFilter | null`、URL パラメータ `priority`、`SearchRpcParams.priority: PriorityFilter | null`
  - `conditions.ts`：`export function isPracticeMode(c: SearchConditions): boolean` と `export function togglePracticeMode(c: SearchConditions): SearchConditions`（Task 7 が使う）
  - `queries.ts`：`SongRow.practicePriority: Priority | null`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// priority.test.ts
expect(parsePriority(1)).toBe(1);
expect(parsePriority(3)).toBe(3);
for (const v of [0, 4, 1.5, "1", "高", null, undefined]) expect(parsePriority(v)).toBeNull();

// sort.test.ts
expect(orderSpecs("priority_asc")).toEqual([
  { column: "practice_priority", ascending: true, nullsFirst: false },
  { column: "created_at", ascending: false },
]);
expect(SORT_LABELS.priority_asc).toBe("練習の優先度が高い順");

// conditions.test.ts
expect(normalizeConditions({ priority: "high" }).priority).toBe("high");
expect(normalizeConditions({ priority: "foo" }).priority).toBeNull();
expect(normalizeConditions({}).priority).toBeNull(); // 古い保存済み条件
expect(conditionsFromParams(new URLSearchParams("priority=mid")).priority).toBe("mid");
expect(conditionsFromParams(new URLSearchParams("priority=x")).priority).toBeNull();
expect(conditionsToParams({ ...EMPTY_CONDITIONS, priority: "set" }).get("priority")).toBe("set");
expect(toRpcParams({ ...EMPTY_CONDITIONS, priority: "high" }, "created_desc").priority).toBe("high");
expect(hasConditions({ ...EMPTY_CONDITIONS, priority: "set" })).toBe(true);
expect(countConditions({ ...EMPTY_CONDITIONS, priority: "set" })).toBe(1);
expect(describeConditions({ ...EMPTY_CONDITIONS, priority: "high" }, () => undefined))
  .toContain("練習の優先度：高だけ");
// 練習モード
const on = togglePracticeMode({ ...EMPTY_CONDITIONS, include: [T1] });
expect(on).toMatchObject({ priority: "set", sort: "priority_asc", include: [T1] });
expect(isPracticeMode(on)).toBe(true);
expect(isPracticeMode({ ...on, sort: "title_asc" })).toBe(false);
const off = togglePracticeMode(on);
expect(off).toMatchObject({ priority: null, sort: null, include: [T1] });
// isPracticeMode でない状態（例：priority=high）から押すと、練習モードになる
expect(togglePracticeMode({ ...EMPTY_CONDITIONS, priority: "high" })).toMatchObject({ priority: "set", sort: "priority_asc" });

// queries.test.ts（既存の fake supabase の書き方に合わせる）
// searchSongs と曲1件の取得が practice_priority を practicePriority に写すこと。不正値（5）は null
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/lib/songs src/lib/search`
Expected: FAIL（`priority.ts` が無い、`priority_asc` が無い など）

- [ ] **Step 3: 実装する**

- `priority.ts` を Interfaces のとおり作る
- `sort.ts`：`orderSpecs` の `switch` に `priority_asc`
- `conditions.ts`：`EMPTY_CONDITIONS.priority = null`、`normalizeConditions` で `PRIORITY_FILTERS.find(...) ?? null`、`hasConditions` / `countConditions` / `conditionsFromParams` / `conditionsToParams` / `toRpcParams` / `describeConditions`（「練習の優先度：」＋ `PRIORITY_FILTER_LABELS`）に足す。`isPracticeMode` は `c.priority === "set" && c.sort === "priority_asc"`。`togglePracticeMode` は、練習モードなら `priority: null, sort: null`、そうでなければ `priority: "set", sort: "priority_asc"`（ほかの条件は残す）
- `queries.ts`：`COLUMNS`・`RawSong`・`SearchRow` に `practice_priority`、`toSongRow` と `searchSongs` の写しで `practicePriority: parsePriority(r.practice_priority)`

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib && npm run typecheck`
Expected: PASS。typecheck で `SortKey` の網羅漏れ（`SORT_LABELS` など）や `SongRow` を作るテスト用データの不足が出たら、ここで直す

- [ ] **Step 5: コミット**

```bash
git add src/lib
git commit -m "feat: 練習の優先度の定義、優先度順の並べ替え、検索条件の優先度を足す"
```

---

### Task 3: 曲の詳細で優先度を表示・編集する

**Files:**
- Modify: `src/lib/songs/validate.ts`、`src/lib/songs/validate.test.ts`
- Modify: `src/components/SongDetail.tsx`（＋ `SongDetail.module.css` など、今のキーの行のスタイルがあるファイル）
- Test: `src/components/SongDetail.test.tsx`、`src/app/(app)/songs/actions.test.ts`

**Interfaces:**
- Consumes: `parsePriority`、`PRIORITIES`、`PRIORITY_LABELS`、`Priority`（Task 2）、`SongRow.practicePriority`（Task 2）
- Produces: `UpdateSongInput.practicePriority: Priority | null`、`UpdatePayload.song.practice_priority: Priority | null`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// validate.test.ts
expect(ok(toUpdatePayload({ ...valid, practicePriority: 2 })).song.practice_priority).toBe(2);
expect(ok(toUpdatePayload({ ...valid, practicePriority: null })).song.practice_priority).toBeNull();
expect(ok(toUpdatePayload({ ...valid, practicePriority: 9 })).song.practice_priority).toBeNull();
expect(ok(toUpdatePayload(valid)).song.practice_priority).toBeNull(); // 送られないとき

// SongDetail.test.tsx
it("表示：練習の優先度に「高」、未設定は「—」");
it("編集：「中」を押して保存すると updateSongAction に practicePriority: 2");
it("編集：「なし」を押して保存すると practicePriority: null");
it("優先度に触れずに曲名だけ変えて保存しても、practicePriority は元の値（1）のまま送られる"); // Review Focus 1
it("押されているボタンは aria-pressed=true が1つだけ");

// songs/actions.test.ts
// update_song の p_song に practice_priority が入ること
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/lib/songs/validate.test.ts src/components/SongDetail.test.tsx "src/app/(app)/songs"`
Expected: FAIL

- [ ] **Step 3: 実装する**

- `validate.ts`：`toUpdatePayload` で `practice_priority: parsePriority(raw.practicePriority)`。登録（`toRegisterPayload`）は送らない（新しい曲は未設定で始まる。DB 側は JSON に無ければ null）
- `SongDetail.tsx`：`const [priority, setPriority] = useState<Priority | null>(song.practicePriority)`、`startEdit` で戻す、`saveEdit` で送る
  - 編集フォームは、キーの行の次に `<fieldset>` ＋ `<legend className={form.label}>練習の優先度</legend>`。ボタンは「なし」→ `PRIORITIES` を逆順（低・中・高）の4つ、`aria-pressed`。見た目は歌唱記録の「歌いやすさ」のボタン（`styles.easeButtons`）に合わせる
  - 表示は `<dl className={styles.stats}>` の「キー」の次に `<dt>練習の優先度</dt><dd>{ラベル or "—"}</dd>`

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/songs src/components "src/app/(app)/songs"`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/songs/validate.ts src/lib/songs/validate.test.ts src/components "src/app/(app)/songs"
git commit -m "feat: 曲の詳細で練習の優先度を表示・編集する"
```

---

### Task 4: エクスポート・インポート

**Files:**
- Modify: `src/lib/data/import.ts`、`src/lib/data/import.test.ts`
- Modify: `src/lib/data/csv.ts`、`src/lib/data/csv.test.ts`

**Interfaces:**
- Consumes: `parsePriority`、`PRIORITY_LABELS`（Task 2）、`export_data` / `import_data` の `practice_priority`（Task 1）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```ts
// import.test.ts（Review Focus 4）
// practice_priority: 1 → 1、2 → 2
// 0・4・"高"・"1"・null・キー自体が無い → null。どれもエラーにならず、ほかの項目は今までどおり取り込まれる

// csv.test.ts
// ヘッダーの「キー」の次に「練習の優先度」
// 1 → 「高」、3 → 「低」、null / 無し → 空欄
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/lib/data`
Expected: FAIL

- [ ] **Step 3: 実装する**

- `import.ts`：曲を組み立てるところで `song_key` の次に `practice_priority: parsePriority(s.practice_priority)`
- `csv.ts`：`ExportedSong.practice_priority?: number | null`。ヘッダーと行で「キー」の次に足す。値は `parsePriority` を通して `PRIORITY_LABELS` で文字にし、`csvCell(..., false)`

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/data "src/app/api"`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/data
git commit -m "feat: エクスポート・インポートと CSV に練習の優先度を含める"
```

---

### Task 5: まとめて編集で優先度を変える

**Files:**
- Modify: `src/lib/songs/bulk-tags.ts`、`src/lib/songs/bulk-tags.test.ts`
- Modify: `src/app/(app)/bulk/actions.ts`、`src/app/(app)/bulk/actions.test.ts`
- Modify: `src/app/(app)/bulk/BulkEditScreen.tsx`、`bulk.module.css`、`BulkEditScreen.test.tsx`

**Interfaces:**
- Consumes: `bulk_edit_song_tags` の `p_set_priority` / `p_priority`（Task 1）、`parsePriority`・`PRIORITIES`・`PRIORITY_LABELS`（Task 2）
- Produces: `BulkTagPayload.priority: { set: false } | { set: true; value: Priority | null }`。入力（`raw`）は `priority?: "keep" | "none" | 1 | 2 | 3`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// bulk-tags.test.ts
// priority が無い・"keep" → { set: false }
// "none" → { set: true, value: null }、2 → { set: true, value: 2 }
// 9・"高" → エラー「練習の優先度が正しくありません」
// タグの変更なし＋優先度だけの変更は OK（今の「何も変えない」エラーにしない）
// タグの変更なし＋priority "keep" は今の「何も変えない」エラーのまま

// actions.test.ts（Review Focus 2）
// タグだけ → rpc の引数に p_set_priority: false, p_priority: null
// 優先度 1 → p_set_priority: true, p_priority: 1

// BulkEditScreen.test.tsx
// 見出し「タグ・優先度の一括変更」
// 既定は「変えない」が押されている。曲を選んでもタグ・優先度とも変えないなら適用ボタンは無効
// 「高」を押して適用 → bulkEditTagsAction に priority: 1、完了メッセージ「N曲を変更しました」、適用後は「変えない」に戻る
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/lib/songs/bulk-tags.test.ts "src/app/(app)/bulk"`
Expected: FAIL

- [ ] **Step 3: 実装する**

- `bulk-tags.ts`：`toBulkTagPayload` に優先度の解釈を足す。「何も変えない」の判定に `priority.set` を含める
- `actions.ts`：rpc の引数に `p_set_priority: payload.value.priority.set` と `p_priority: payload.value.priority.set ? payload.value.priority.value : null`
- `BulkEditScreen.tsx`：`const [priority, setPriority] = useState<"keep" | "none" | Priority>("keep")`。タグの編集の下に `<fieldset>` ＋ `<legend>練習の優先度をまとめて変える</legend>` と「変えない・なし・低・中・高」のボタン（`aria-pressed`）。`nothingToDo` に `priority === "keep"` を含める。完了メッセージは「N曲を変更しました」。見出しを「タグ・優先度の一括変更」に、説明文を「曲を選んで、タグや練習の優先度をまとめて変えられます。まとめて登録したときの付け忘れの手直しに。」に。`bulk/page.tsx` の `metadata.title` も同じ見出しに。ここへのリンクの文言（`add/BulkAdd.tsx:84`、`settings/SettingsScreen.tsx:114`、`help/page.tsx:221`）も「タグ・優先度の一括変更」に直す

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/lib/songs "src/app/(app)/bulk" "src/app/(app)/add" "src/app/(app)/settings" src/app/pages.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/songs/bulk-tags.ts src/lib/songs/bulk-tags.test.ts "src/app/(app)/bulk" "src/app/(app)/add/BulkAdd.tsx" "src/app/(app)/settings/SettingsScreen.tsx" src/app/help/page.tsx
git commit -m "feat: まとめて編集で練習の優先度を変えられるようにする"
```

---

### Task 6: 検索の条件フォームに優先度を足す

**Files:**
- Modify: `src/components/ConditionsForm.tsx`
- Test: `src/components/ConditionsForm.test.tsx`

**Interfaces:**
- Consumes: `PRIORITY_FILTERS`・`PRIORITY_FILTER_LABELS`（Task 2）、`SearchConditions.priority`（Task 2）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("「練習の優先度」に 高だけ・中以上・設定あり のチップがある");
it("「中以上」を押すと priority: \"mid\"、もう一度押すと null");
it("並べ替えに「練習の優先度が高い順」がある"); // SORT_KEYS から自動で出ることの確認
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/components "src/app/(app)/search"`
Expected: FAIL

- [ ] **Step 3: 実装する**

「直近の歌いやすさ」の `fieldset` の次に、同じ作りで「練習の優先度」の `fieldset` を置く（`aria-pressed={c.priority === f}`、押すと `set({ priority: c.priority === f ? null : f })`）

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components "src/app/(app)/search" "src/app/(app)/SetList"`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components "src/app/(app)/search"
git commit -m "feat: 検索の条件に練習の優先度を足す"
```

---

### Task 7: ホームのバッジ・「練習する」チップ・一覧に出す項目の設定

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/SetList.tsx`、`setlist.module.css`（今のキーのバッジ `styles.key` があるファイル）、`SetList.test.tsx`
- Modify: `src/app/(app)/settings/actions.ts`、`SettingsScreen.tsx`、それぞれのテスト
- Modify: `src/lib/songs/queries.ts`（`getUserSettings` の既定値）、`queries.test.ts`

**Interfaces:**
- Consumes: `isPracticeMode` / `togglePracticeMode`（Task 2）、`PRIORITY_LABELS`、`SongRow.practicePriority`
- Produces: `SetList` の props に `prioritizedCount: number`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// SetList.test.tsx
it("listColumns に priority があると、優先度が付いた曲に「優先：高」のバッジ。無い曲には出さない");
it("listColumns に priority が無いとバッジを出さない");
it("prioritizedCount > 0 のとき「すべて」のすぐ次に「練習する」チップ");
it("prioritizedCount が 0 なら「練習する」チップを出さない");
it("「練習する」を押すと URL が priority=set&sort=priority_asc になり、タグのチップの条件は残る");
it("練習モード中は「練習する」が aria-pressed=true、もう一度押すと priority と sort が外れる");
it("練習モード中に並べ替えメニューで曲名順を選ぶと、「練習する」は aria-pressed=false"); // Review Focus 5

// settings/actions.test.ts
// listColumns: ["priority"] を保存できる（COLUMNS に priority）。不明な値は今までどおり落とす

// SettingsScreen.test.tsx
// 「一覧に表示する項目」に「練習の優先度」のチェックボックス

// queries.test.ts
// user_settings の行が無いときの既定は ["key","tags","priority"]
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run "src/app/(app)" src/lib/songs/queries.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- `page.tsx`：`Promise.all` に `supabase.from("songs").select("id", { count: "exact", head: true }).not("practice_priority", "is", null)` を足し、`prioritizedCount={res.count ?? 0}` を渡す
- `SetList.tsx`：
  - `const showPriority = listColumns.includes("priority")`。キーのバッジの隣に、`showPriority && s.practicePriority !== null` のとき `<span className={styles.key}>優先：{PRIORITY_LABELS[s.practicePriority]}</span>`（キーと同じクラスで見た目を合わせる）
  - チップの列で「すべて」の次に、`prioritizedCount > 0` のとき `<button className={styles.chip} aria-pressed={isPracticeMode(draft)} onClick={() => change(togglePracticeMode(draft))}>練習する</button>`。`change` は既存のチップと同じ関数を使う
  - Props のコメント「一覧に出す基本項目」を `"key" / "tags" / "priority"` に直す
- `settings/actions.ts`：`COLUMNS = ["key", "tags", "priority"]`
- `SettingsScreen.tsx`：「タグ」のチェックボックスの次に「練習の優先度」
- `queries.ts`：`getUserSettings` の既定値を `["key", "tags", "priority"]`

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run "src/app/(app)" src/lib`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add "src/app/(app)" src/lib/songs/queries.ts src/lib/songs/queries.test.ts
git commit -m "feat: ホームに優先度のバッジと「練習する」チップを足す"
```

---

### Task 8: ヘルプとドキュメント

**Files:**
- Modify: `src/lib/help.ts`、`src/app/help/page.tsx`、ヘルプのテスト（`src/app/pages.test.tsx`）
- Modify: `docs/open-questions.md`、`CLAUDE.md`

**Interfaces:**
- Consumes: なし
- Produces: `HELP_SECTIONS.practice = "practice"`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it("ヘルプに id=practice の「練習の優先度」の節があり、「練習する」チップと「なし」に戻すことに触れている");
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/app/pages.test.tsx`
Expected: FAIL

- [ ] **Step 3: 書く**

- `help.ts`：`tags` の次に `practice: "practice"`
- `page.tsx`：「タグ」の節の次に `<section id={id("practice")} aria-labelledby="h-practice">`。見出し「練習の優先度」。本文は、曲の詳細の「編集」で高・中・低を付けられること、タグ管理の「タグ・優先度の一括変更」でまとめて付けられること、ホームの「練習する」を押すと優先度が付いた曲が高い順に並ぶこと、検索で「高だけ」などに絞れること、練習が終わったら「なし」に戻すこと。ほかの節と同じ文体・部品で書く
- `docs/open-questions.md` の「決定済み」に1項目：「**練習の優先順位（Issue #11、2026-10-20）**：`songs.practice_priority`（1=高・2=中・3=低、null=未設定）。『歌える度』タグとは連動させず、利用者が自分で外す。ホームに『練習する』チップ（優先度あり＋優先度順）。検索は高だけ・中以上・設定あり。まとめて編集は `bulk_edit_song_tags` の引数で同じトランザクションに含める」
- `CLAUDE.md` の「決定済みの仕様」に1行：「練習の優先度は `songs.practice_priority`（高・中・低）。タグとは連動しない（Issue #11）」。「現在の状況」の Issue 一覧から「練習の優先順位 #11」を外し、追加した機能の一覧に「練習の優先度」を足す

- [ ] **Step 4: 全体の確認**

Run: `npm run lint && npm run typecheck && npm run format:check && npm run test:coverage`、続けて `TEST_DATABASE_URL=postgres://postgres:pw@localhost:54329/postgres npm test`
Expected: すべて PASS。カバレッジが今の水準（約99%）から下がっていない

- [ ] **Step 5: コミット**

```bash
git add src/lib/help.ts src/app/help docs/open-questions.md CLAUDE.md
git commit -m "docs: 練習の優先度のヘルプと決定事項を書く"
```
