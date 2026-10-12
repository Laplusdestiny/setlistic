"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { visibleFields, type CustomField } from "@/lib/custom-fields";
import { quotaFullMessage, quotaStatus, type Quota } from "@/lib/songs/quota";
import { parseMusicUrl } from "@/lib/songs/apple-url";
import type { SongDraft } from "@/lib/songs/types";
import { normalizeTagName } from "@/lib/tags/normalize";
import { lookupFromUrl, saveSongAction } from "./actions";
import { BulkAdd } from "./BulkAdd";
import { lookupErrorMessage, SERVICE_NAMES } from "./messages";
import { SearchPanel } from "./SearchPanel";
import { FieldInputs } from "@/components/FieldInputs";
import { KeyStepper } from "@/components/KeyStepper";
import { TagPicker } from "@/components/TagPicker";
import type { NewTag } from "@/lib/tags/types";
import type {
  Candidate,
  DuplicateInfo,
  ExternalInfo,
  GroupOption,
  LookupError,
  TagOption,
} from "./types";
import styles from "./add.module.css";

type Props = {
  initialUrl: string;
  groups: GroupOption[];
  tags: TagOption[];
  defaultTagIds: string[];
  fields: CustomField[];
  /** 登録できる曲数（使用量と上限）。取得できなければ null */
  quota: Quota | null;
};

type Source = "url" | "search" | "manual";

const RECOGNIZED: Record<string, string> = {
  apple_music: "Apple Music",
  spotify: "Spotify",
  youtube_music: "YouTube Music",
};

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

export function AddSong({ initialUrl, groups, tags, defaultTagIds, fields, quota }: Props) {
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
  /** Spotify / YouTube Music から取得したときの、候補と取得元の表記 */
  const [external, setExternal] = useState<ExternalInfo | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set(defaultTagIds));
  const [newTags, setNewTags] = useState<NewTag[]>([]);
  const [songKey, setSongKey] = useState<number>(0);
  const [memo, setMemo] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const shownFields = visibleFields(fields);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const recognized = useMemo(() => parseMusicUrl(url), [url]);

  /** Apple Music のジャンルを、登録時に付けるタグの提案にする（既存タグがあればそれを選ぶ） */
  function genreTag(d: SongDraft): { id: string } | { tag: NewTag } | null {
    if (!d.genre) return null;
    const key = normalizeTagName(d.genre);
    const existing = tags.find((t) => normalizeTagName(t.name) === key);
    return existing ? { id: existing.id } : { tag: { name: d.genre, group: "ジャンル" } };
  }

  function begin(
    d: SongDraft,
    from: Source,
    dup: DuplicateInfo = null,
    ext: ExternalInfo | null = null,
  ) {
    setDraft(d);
    setSource(from);
    setDuplicate(dup);
    setExternal(ext);
    // 手入力と、Apple Music で見つからず取得元の表記を使うときは、最初から入力欄を出す
    setEditing(from === "manual" || ext?.confidence === "not_found");
    setLookupError(null);
    setSaveError(null);
    setMessage(null);
    setSongKey(0);
    setMemo("");
    setFieldValues({});

    // 登録時に付けるタグ ＋ Apple Music のジャンル（提案。外せる）
    const ids = new Set(defaultTagIds);
    const added: NewTag[] = [];
    const g = genreTag(d);
    if (g && "id" in g) ids.add(g.id);
    else if (g) added.push(g.tag);
    setSelected(ids);
    setNewTags(added);
  }

  /** 要確認の候補・取得元の表記を選び直す。前の候補のジャンル提案は外し、新しい候補のものに差し替える */
  function choose(c: Candidate, edit: boolean) {
    if (!draft) return;
    const before = genreTag(draft);
    const after = genreTag(c.draft);
    setSelected((prev) => {
      const next = new Set(prev);
      if (before && "id" in before && !defaultTagIds.includes(before.id)) next.delete(before.id);
      if (after && "id" in after) next.add(after.id);
      return next;
    });
    setNewTags((prev) => {
      const kept =
        before && "tag" in before ? prev.filter((t) => t.name !== before.tag.name) : prev;
      return after && "tag" in after && !kept.some((t) => t.name === after.tag.name)
        ? [...kept, after.tag]
        : kept;
    });
    setDraft(c.draft);
    setDuplicate(c.duplicate);
    setEditing(edit);
  }

  function fetchSong() {
    setMessage(null);
    start(async () => {
      const res = await lookupFromUrl(url);
      if (res.status === "ok") begin(res.draft, "url", res.duplicate, res.external ?? null);
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
    setExternal(null);
    setSelected(new Set(defaultTagIds));
    setNewTags([]);
    setSongKey(0);
    setMemo("");
    setFieldValues({});
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
        fields: fieldValues,
        tagIds: [...selected],
        newTags,
      });
      if (res.status === "ok") {
        if (andContinue) reset(`「${draft.title}」を追加しました。続けて登録できます。`);
        else {
          router.push("/");
          router.refresh();
        }
      } else if (res.status === "limit") {
        setSaveError(quotaFullMessage(quota?.max ?? 0));
      } else if (res.status === "duplicate") {
        setDuplicate({ id: "", title: draft.title });
      } else {
        setSaveError(res.message);
      }
    });
  }

  const qs = quota ? quotaStatus(quota) : null;
  const full = qs?.level === "full";
  const canSave =
    Boolean(draft && draft.title.trim() && draft.artist.trim() && !duplicate) && !pending && !full;
  const step = draft ? "confirm" : "input";

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

      {quota && qs && qs.level !== "ok" && (
        <p role={full ? "alert" : "status"} className={full ? styles.quotaFull : styles.quotaNear}>
          {full
            ? quotaFullMessage(quota.max)
            : `登録できる曲数の上限（${quota.max.toLocaleString("ja-JP")}曲）まで、あと${qs.remaining}曲です。`}
        </p>
      )}

      {mode === "bulk" ? (
        <div className={`${styles.body} ${styles.bulkBody}`}>
          <BulkAdd
            groups={groups}
            tags={tags}
            defaultTagIds={defaultTagIds}
            remaining={qs?.remaining ?? null}
          />
        </div>
      ) : (
        <>
          <div className={styles.body}>
            <div className={`${styles.panel} ${styles.inputPanel}`}>
              <div className={styles.methods} role="group" aria-label="登録のしかた">
                <button
                  type="button"
                  aria-pressed={panel === "url"}
                  onClick={() => setPanel("url")}
                >
                  <strong>URLから</strong>
                  <small>共有URLを貼る</small>
                </button>
                <button
                  type="button"
                  aria-pressed={panel === "search"}
                  onClick={() => setPanel("search")}
                >
                  <strong>曲名で探す</strong>
                  <small>URLがないとき</small>
                </button>
                <button type="button" aria-pressed={false} onClick={() => begin(BLANK, "manual")}>
                  <strong>手入力</strong>
                  <small>自分で書く</small>
                </button>
              </div>

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
                      placeholder="https://music.apple.com/jp/album/… や https://open.spotify.com/track/…"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <div className={styles.urlRow}>
                      <span className={styles.recognized} aria-live="polite">
                        {recognized.ok && `✓ ${RECOGNIZED[recognized.service]} のURLを認識`}
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
                      {["Apple Music", "Spotify", "YouTube Music"].map((s) => (
                        <li key={s} className={styles.service}>
                          {s}
                          <small>対応</small>
                        </li>
                      ))}
                      <li className={styles.service} data-soon>
                        Amazon Music<small>検討中</small>
                      </li>
                    </ul>
                  </section>
                </>
              ) : (
                <>
                  <SearchPanel onPick={(d) => begin(d, "search")} />
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
                  {external && (
                    <ExternalChoice external={external} draft={draft} onChoose={choose} />
                  )}

                  <div className={`${styles.card} ${styles.preview}`}>
                    <div className={styles.previewBody}>
                      {source !== "manual" && (
                        <span className={styles.fetched}>
                          {fetchedLabel(source, external, draft)}
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
                        <KeyStepper value={songKey} onChange={setSongKey} />
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
                    {shownFields.length > 0 && (
                      <div className={styles.fieldsBox}>
                        <FieldInputs
                          fields={shownFields}
                          values={fieldValues}
                          onChange={(id, v) => setFieldValues((prev) => ({ ...prev, [id]: v }))}
                        />
                      </div>
                    )}
                    <Link
                      href="/settings#fields"
                      className={styles.linkButton}
                      style={{ alignSelf: "flex-start" }}
                    >
                      ＋ 項目を追加・編集（設定）
                    </Link>
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

function fetchedLabel(source: Source, external: ExternalInfo | null, draft: SongDraft): string {
  if (source === "search") return "Apple Music の検索結果から選択";
  if (!external) return "Apple Music から取得";
  const name = SERVICE_NAMES[external.service];
  return draft.appleTrackId
    ? `${name} から取得し、Apple Music の表記にそろえました`
    : `${name} の表記のまま`;
}

/**
 * Spotify / YouTube Music から取得したときの案内。
 * - 確信あり：案内だけ（入力欄は Apple Music の表記で埋まっている）
 * - 要確認：候補（最大3件）か、取得元の表記を選ぶ
 * - 見つからず：取得元の表記で入力欄を埋めたことを伝える
 */
function ExternalChoice({
  external,
  draft,
  onChoose,
}: {
  external: ExternalInfo;
  draft: SongDraft;
  onChoose: (c: Candidate, edit: boolean) => void;
}) {
  const name = SERVICE_NAMES[external.service];
  const src = external.source.draft;

  if (external.confidence === "not_found") {
    return (
      <p role="status" className={styles.warn}>
        {external.itunesFailed
          ? `Apple Music の曲情報を検索できなかったため、${name} の表記で入力しています。`
          : `Apple Music で該当する曲が見つからなかったため、${name} の表記で入力しています。`}
        内容を確認し、必要なら修正してください。
      </p>
    );
  }
  if (external.confidence === "confident") return null;

  const isSource = draft.appleTrackId === null;
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.sectionTitle}>どの曲として登録しますか？</legend>
      <p className={styles.hint}>
        {name} の「{src.title}」{src.artist && ` ／ ${src.artist}`}
        に近い曲が見つかりました。表記の違う同じ曲を選ぶか、{name} の表記のまま登録できます。
      </p>
      <ul className={styles.results}>
        {external.candidates.map((c) => (
          <li key={c.draft.appleTrackId}>
            <label className={styles.choice}>
              <input
                type="radio"
                name="candidate"
                checked={draft.appleTrackId === c.draft.appleTrackId}
                onChange={() => onChoose(c, false)}
              />
              <span>
                <strong>{c.draft.title}</strong>
                <br />
                <span className={styles.songArtist}>
                  {c.draft.artist}
                  {c.draft.album ? ` ／ ${c.draft.album}` : ""}
                </span>
                {c.duplicate && <span className={styles.hint}>（登録済み）</span>}
              </span>
            </label>
          </li>
        ))}
        <li>
          <label className={styles.choice}>
            <input
              type="radio"
              name="candidate"
              checked={isSource}
              onChange={() => onChoose(external.source, true)}
            />
            <span>
              <strong>{name} の表記で登録する</strong>
              <br />
              <span className={styles.songArtist}>
                {src.title}
                {src.artist ? ` ／ ${src.artist}` : ""}（修正できます）
              </span>
            </span>
          </label>
        </li>
      </ul>
    </fieldset>
  );
}
