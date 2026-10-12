import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUid, authUsers, authenticatedRole } from "drizzle-orm/supabase";

// 全テーブル共通：本人の行だけ読み書きできる。
const ownRows = (table: string) =>
  pgPolicy(`${table}_own_rows`, {
    for: "all",
    to: authenticatedRole,
    using: sql`${authUid} = user_id`,
    withCheck: sql`${authUid} = user_id`,
  });

const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });

// ───────── 曲 ─────────
export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    appleTrackId: bigint("apple_track_id", { mode: "number" }), // 手動登録ではnull
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    album: text("album"),
    genre: text("genre"),
    artworkUrl: text("artwork_url"), // 文字列のみ保存。MVPでは表示しない
    durationMs: integer("duration_ms"),
    releaseDate: date("release_date"),
    appleUrl: text("apple_url"),
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    // 習熟度はタグ（「歌える度」グループ）で表現する（open-questions #2）
    songKey: smallint("song_key"),
    memo: text("memo"), // 将来の共有機能では共有対象外
    lastSungAt: date("last_sung_at"),
    sungCount: integer("sung_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("songs_user_apple_track_unique").on(t.userId, t.appleTrackId),
    index("songs_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("songs_user_last_sung_idx").on(t.userId, t.lastSungAt.desc().nullsLast()),
    check(
      "songs_source_service_check",
      sql`${t.sourceService} in ('apple_music','spotify','youtube_music','amazon_music','manual','search')`,
    ),
    check("songs_song_key_check", sql`${t.songKey} between -7 and 7`),
    ownRows("songs"),
  ],
).enableRLS();

// ───────── タグ ─────────
export const tagGroups = pgTable(
  "tag_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [unique("tag_groups_user_name_unique").on(t.userId, t.name), ownRows("tag_groups")],
).enableRLS();

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    groupId: uuid("group_id").references(() => tagGroups.id, { onDelete: "set null" }), // nullは「マイタグ」扱い
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(), // NFKC、前後空白除去、英字小文字化
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tags_user_normalized_name_unique").on(t.userId, t.normalizedName),
    index("tags_group_idx").on(t.groupId),
    ownRows("tags"),
  ],
).enableRLS();

export const tagAliases = pgTable(
  "tag_aliases",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    userId: userId(),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.normalizedAlias] }),
    pgPolicy("tag_aliases_own_rows", {
      for: "all",
      to: authenticatedRole,
      using: sql`${authUid} = ${t.userId}`,
      withCheck: sql`${authUid} = ${t.userId} and exists (select 1 from tags r where r.id = ${t.tagId} and r.user_id = ${authUid})`,
    }),
  ],
).enableRLS();

export const songTags = pgTable(
  "song_tags",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    userId: userId(), // RLS判定用に冗長に持つ
  },
  (t) => [
    primaryKey({ columns: [t.songId, t.tagId] }),
    index("song_tags_tag_idx").on(t.tagId),
    pgPolicy("song_tags_own_rows", {
      for: "all",
      to: authenticatedRole,
      using: sql`${authUid} = ${t.userId}`,
      withCheck: sql`${authUid} = ${t.userId}
        and exists (select 1 from songs r where r.id = ${t.songId} and r.user_id = ${authUid})
        and exists (select 1 from tags r where r.id = ${t.tagId} and r.user_id = ${authUid})`,
    }),
  ],
).enableRLS();

// ───────── カスタム項目 ─────────
export const customFields = pgTable(
  "custom_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    name: text("name").notNull(),
    fieldType: text("field_type").notNull(),
    options: jsonb("options"), // select系の選択肢 ["DAM","JOYSOUND"] など
    sortOrder: integer("sort_order").notNull().default(0),
    showInList: boolean("show_in_list").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [
    unique("custom_fields_user_name_unique").on(t.userId, t.name),
    check(
      "custom_fields_type_check",
      sql`${t.fieldType} in ('text','number','select','multi_select','date','checkbox')`,
    ),
    ownRows("custom_fields"),
  ],
).enableRLS();

export const songFieldValues = pgTable(
  "song_field_values",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    userId: userId(),
    value: jsonb("value").notNull(), // 型ごとの値をjsonbで保持
  },
  (t) => [
    primaryKey({ columns: [t.songId, t.fieldId] }),
    pgPolicy("song_field_values_own_rows", {
      for: "all",
      to: authenticatedRole,
      using: sql`${authUid} = ${t.userId}`,
      withCheck: sql`${authUid} = ${t.userId}
        and exists (select 1 from songs r where r.id = ${t.songId} and r.user_id = ${authUid})
        and exists (select 1 from custom_fields r where r.id = ${t.fieldId} and r.user_id = ${authUid})`,
    }),
  ],
).enableRLS();

// ───────── 歌唱記録 ─────────
export const singLogs = pgTable(
  "sing_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    sungAt: date("sung_at")
      .notNull()
      .default(sql`current_date`),
    ease: smallint("ease"), // 歌いやすさ 1 余裕〜5 辛かった、任意
    note: text("note"),
  },
  (t) => [
    index("sing_logs_song_idx").on(t.songId, t.sungAt.desc()),
    check("sing_logs_ease_check", sql`${t.ease} between 1 and 5`),
    pgPolicy("sing_logs_own_rows", {
      for: "all",
      to: authenticatedRole,
      using: sql`${authUid} = ${t.userId}`,
      withCheck: sql`${authUid} = ${t.userId} and exists (select 1 from songs r where r.id = ${t.songId} and r.user_id = ${authUid})`,
    }),
  ],
).enableRLS();

// ───────── 保存した検索条件 ─────────
export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    name: text("name").notNull(),
    conditions: jsonb("conditions").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  () => [ownRows("saved_searches")],
).enableRLS();

// ───────── ユーザー設定 ─────────
// テーマ列は持たない：MVPはライトのみ（open-questions #7）
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    listSort: text("list_sort").notNull().default("created_desc"),
    listColumns: jsonb("list_columns")
      .notNull()
      .default(sql`'["key","tags"]'::jsonb`),
    defaultTagIds: uuid("default_tag_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [ownRows("user_settings")],
).enableRLS();

// ───────── 招待制の許可リスト ─────────
// メールアドレスそのものは持たず、小文字化したメールの SHA-256 のみ保存する。
// ポリシーを置かない（RLSのみ有効）ので anon / authenticated からは読めない。
// 参照するのは Before User Created フック（security definer）だけ。
export const allowedEmails = pgTable("allowed_emails", {
  emailHash: text("email_hash").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
