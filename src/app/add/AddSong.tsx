"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { parseMusicUrl } from "@/lib/songs/apple-url";
import { clampKey, formatKey } from "@/lib/songs/key";
import type { SongDraft } from "@/lib/songs/types";
import { normalizeTagName } from "@/lib/tags/normalize";
import { lookupFromUrl, saveSongAction } from "./actions";
import { BulkAdd } from "./BulkAdd";
import { lookupErrorMessage } from "./messages";
import { SearchPanel } from "./SearchPanel";
import { TagPicker, type NewTag } from "./TagPicker";
import type { DuplicateInfo, GroupOption, LookupError, TagOption } from "./types";
import styles from "./add.module.css";

type Props = {
  initialUrl: string;
  groups: GroupOption[];
  tags: TagOption[];
  defaultTagIds: string[];
  nextNumber: number;
};

type Source = "url" | "search" | "manual";

const BLANK: SongDraft = {
  appleTrackId: null,
  title: "",
  artist: "",
  album: null,
  genre: null,
  artworkUrl: null,
  durationMs: null,
  releaseDate: null,
  appleUrl: null,
  sourceService: "manual",
  sourceUrl: null,
};

export function AddSong({ initialUrl, groups, tags, defaultTagIds, nextNumber }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [panel, setPanel] = useState<"url" | "search">("url");
  const [url, setUrl] = useState(initialUrl);
  const [lookupError, setLookupError] = useState<{
    reason: LookupError;
    service?: string | null;
  } | null>(null);

  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [source, setSource] = useState<Source>("url");
  const [duplicate, setDuplicate] = useState<DuplicateInfo>(null);
  const [editing, setEditing] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set(defaultTagIds));
  const [newTags, setNewTags] = useState<NewTag[]>([]);
  const [songKey, setSongKey] = useState<number | null>(null);
  const [memo, setMemo] = useState("");

  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const recognized = useMemo(() => parseMusicUrl(url), [url]);

  function begin(d: SongDraft, from: Source, dup: DuplicateInfo = null) {
    setDraft(d);
    setSource(from);
    setDuplicate(dup);
    setEditing(from === "manual");
    setLookupError(null);
    setSaveError(null);
    setMessage(null);
    setSongKey(null);
    setMemo("");

    // 登録時に付けるタグ ＋ Apple Music のジャンル（提案。外せる）
    const ids = new Set(defaultTagIds);
    const added: NewTag[] = [];
    if (d.genre) {
      const key = normalizeTagName(d.genre);
      const existing = tags.find((t) => normalizeTagName(t.name) === key);
      if (existing) ids.add(existing.id);
      else added.push({ name: d.genre, group: "ジャンル" });
    }
    setSelected(ids);
    setNewTags(added);
  }

  function fetchSong() {
    setMessage(null);
    start(async () => {
      const res = await lookupFromUrl(url);
      if (res.status === "ok") begin(res.draft, "url", res.duplicate);
      else setLookupError({ reason: res.reason, service: res.service });
    });
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch {
      // 許可されていない・非対応の端末では何もしない（手で貼り付けてもらう）
    }
  }

  function reset(note: string | null) {
    setDraft(null);
    setUrl("");
    setDuplicate(null);
    setSelected(new Set(defaultTagIds));
    setNewTags([]);
    setSongKey(null);
    setMemo("");
    setLookupError(null);
    setSaveError(null);
    setMessage(note);
  }

  function save(andContinue: boolean) {
    if (!draft) return;
    setSaveError(null);
    start(async () => {
      const res = await saveSongAction({
        draft,
        songKey,
        memo,
        tagIds: [...selected],
        newTags,
      });
      if (res.status === "ok") {
        if (andContinue) reset(`「${draft.title}」を追加しました。続けて登録できます。`);
        else {
          router.push("/");
          router.refresh();
        }
      } else if (res.status === "duplicate") {
        setDuplicate({ id: "", title: draft.title });
      } else {
        setSaveError(res.message);
      }
    });
  }

  const canSave =
    Boolean(draft && draft.title.trim() && draft.artist.trim() && !duplicate) && !pending;
  const step = draft ? "confirm" : "input";
  const number = String(nextNumber).padStart(2, "0");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className={styles.page} data-step={mode === "single" ? step : "input"}>
      <header className={styles.header}>
        {draft && mode === "single" ? (
          <button
            type="button"
            className={`${styles.iconLink} ${styles.backOnly}`}
            aria-label="戻る"
            onClick={() => setDraft(null)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        ) : (
          <Link href="/" className={styles.iconLink} aria-label="閉じる">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        )}
        <h1 className={styles.title}>{draft && mode === "single" ? "内容を確認" : "曲を登録"}</h1>
        <div
          className={`${styles.tabs} ${draft ? styles.onlyWide : ""}`}
          role="group"
          aria-label="登録方法"
        >
          <button
            type="button"
            className={styles.tab}
            aria-pressed={mode === "single"}
            onClick={() => setMode("single")}
          >
            1曲ずつ
          </button>
          <button
            type="button"
            className={styles.tab}
            aria-pressed={mode === "bulk"}
            onClick={() => setMode("bulk")}
          >
            まとめて登録
          </button>
        </div>
      </header>

      {mode === "bulk" ? (
        <div className={`${styles.body} ${styles.bulkBody}`}>
          <BulkAdd />
        </div>
      ) : (
        <>
          <div className={styles.body}>
            <div className={`${styles.panel} ${styles.inputPanel}`}>
              {panel === "url" ? (
                <>
                  <h2 className="visually-hidden">URLから登録</h2>
                  <p className={styles.lead}>
                    音楽アプリの「共有 →
                    リンクをコピー」で取得したURLを貼り付けてください。曲名・アーティストを自動で取得します。
                  </p>
                  <label htmlFor="url" className={styles.label}>
                    共有URL
                  </label>
                  <div className={styles.urlBox}>
                    <textarea
                      id="url"
                      rows={3}
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setLookupError(null);
                      }}
                      placeholder="https://music.apple.com/jp/album/…"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <div className={styles.urlRow}>
                      <span className={styles.recognized} aria-live="polite">
                        {recognized.ok && "✓ Apple Music のURLを認識"}
                      </span>
                      <button type="button" className={styles.small} onClick={paste}>
                        ペースト
                      </button>
                    </div>
                  </div>

                  {lookupError && (
                    <p role="alert" className={styles.error}>
                      {lookupErrorMessage(lookupError.reason, lookupError.service)}
                    </p>
                  )}
                  {message && (
                    <p role="status" className={styles.notice}>
                      {message}
                    </p>
                  )}

                  <button
                    type="button"
                    className={styles.primary}
                    disabled={pending || !url.trim()}
                    onClick={fetchSong}
                  >
                    {pending && !draft ? "取得中…" : "曲情報を取得"}
                  </button>

                  <section aria-labelledby="svc-h" className={styles.panel}>
                    <h2
                      id="svc-h"
                      className={styles.sectionTitle}
                      style={{ fontWeight: 500, color: "var(--color-ink-muted)", fontSize: 13 }}
                    >
                      対応サービス
                    </h2>
                    <ul className={styles.services}>
                      <li className={styles.service}>
                        Apple Music<small>対応（MVP）</small>
                      </li>
                      {["Spotify", "YouTube Music", "Amazon Music"].map((s) => (
                        <li key={s} className={styles.service} data-soon>
                          {s}
                          <small>検討中</small>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setPanel("search")}
                    >
                      曲名で探して登録
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => begin(BLANK, "manual")}
                    >
                      URLなしで手入力する
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <SearchPanel onPick={(d) => begin(d, "search")} />
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setPanel("url")}
                    >
                      URLから登録に戻る
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => begin(BLANK, "manual")}
                    >
                      手入力する
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className={`${styles.panel} ${styles.confirmPanel}`}>
              {!draft ? (
                <p className={styles.placeholder}>
                  取得した曲の内容がここに表示されます。タグとメモもここで付けられます。
                </p>
              ) : (
                <>
                  <div className={`${styles.card} ${styles.preview}`}>
                    <span className={styles.number} aria-hidden="true">
                      {number}
                    </span>
                    <div className={styles.previewBody}>
                      {source !== "manual" && (
                        <span className={styles.fetched}>
                          {source === "url"
                            ? "Apple Music から取得"
                            : "Apple Music の検索結果から選択"}
                        </span>
                      )}
                      {!editing ? (
                        <>
                          <span className={styles.songTitle}>{draft.title}</span>
                          <span className={styles.songArtist}>{draft.artist}</span>
                          <button
                            type="button"
                            className={styles.linkButton}
                            style={{ alignSelf: "flex-start", padding: 0, fontSize: 12 }}
                            onClick={() => setEditing(true)}
                          >
                            曲名・アーティストを修正
                          </button>
                        </>
                      ) : (
                        <div className={styles.fields}>
                          <label className={styles.label} htmlFor="f-title">
                            曲名
                          </label>
                          <input
                            id="f-title"
                            className={styles.input}
                            value={draft.title}
                            maxLength={200}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                          />
                          <label className={styles.label} htmlFor="f-artist">
                            アーティスト
                          </label>
                          <input
                            id="f-artist"
                            className={styles.input}
                            value={draft.artist}
                            maxLength={200}
                            onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {duplicate && (
                    <p role="alert" className={styles.warn}>
                      「{duplicate.title}
                      」はすでにセトリに登録されています。重複して登録することはできません。
                    </p>
                  )}

                  <TagPicker
                    groups={groups}
                    tags={tags}
                    selectedIds={selected}
                    newTags={newTags}
                    onToggle={toggle}
                    onSelect={(id) => setSelected((prev) => new Set(prev).add(id))}
                    onAddNew={(t) => setNewTags((prev) => [...prev, t])}
                    onRemoveNew={(name) =>
                      setNewTags((prev) => prev.filter((t) => t.name !== name))
                    }
                  />

                  <section className={styles.panel} aria-labelledby="memo-h">
                    <h2 id="memo-h" className={styles.sectionTitle}>
                      メモ項目
                    </h2>
                    <div className={styles.memoBox}>
                      <div className={styles.row}>
                        <span id="key-label">キー</span>
                        <div className={styles.stepper} role="group" aria-labelledby="key-label">
                          <button
                            type="button"
                            className={styles.step}
                            aria-label="キーを下げる"
                            onClick={() => setSongKey(clampKey((songKey ?? 0) - 1))}
                          >
                            −
                          </button>
                          <span className={styles.keyValue} aria-live="polite">
                            {songKey === null ? "未設定" : formatKey(songKey)}
                          </span>
                          <button
                            type="button"
                            className={styles.step}
                            aria-label="キーを上げる"
                            onClick={() => setSongKey(clampKey((songKey ?? 0) + 1))}
                          >
                            ＋
                          </button>
                        </div>
                      </div>
                      <div className={styles.memoField}>
                        <label htmlFor="memo">メモ</label>
                        <textarea
                          id="memo"
                          rows={2}
                          maxLength={2000}
                          value={memo}
                          onChange={(e) => setMemo(e.target.value)}
                          placeholder="サビ前で息継ぎ、など"
                        />
                      </div>
                    </div>
                  </section>

                  {saveError && (
                    <p role="alert" className={styles.error}>
                      {saveError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {draft && (
            <div className={styles.footer}>
              <Link
                href="/"
                className={`${styles.secondary} ${styles.onlyWide}`}
                style={{ textDecoration: "none" }}
              >
                キャンセル
              </Link>
              <button
                type="button"
                className={`${styles.secondary} ${styles.onlyWide}`}
                disabled={!canSave}
                onClick={() => save(true)}
              >
                保存して続けて登録
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={!canSave}
                onClick={() => save(false)}
              >
                {pending ? "保存中…" : "セトリに追加"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
