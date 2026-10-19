"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { conditionsToHref, EMPTY_CONDITIONS } from "@/lib/search/conditions";
import { planKaraokeTags } from "@/lib/tags/karaoke";
import { GROUP_NAME_MAX, moveItem, placeItem } from "@/lib/tags/manage";
import { normalizeTagName } from "@/lib/tags/normalize";
import type { GroupOption } from "@/lib/tags/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  addKaraokeTagsAction,
  createGroupAction,
  createTagAction,
  deleteGroupAction,
  placeTagAction,
  renameGroupAction,
  reorderGroupsAction,
  reorderTagsAction,
} from "./actions";
import { TagEditor } from "./TagEditor";
import styles from "./tags.module.css";
import { useTagDrag, type TagDrop } from "./useTagDrag";

export type ManagedTag = {
  id: string;
  name: string;
  groupId: string | null;
  count: number;
  aliases: string[];
};

type Props = { groups: GroupOption[]; tags: ManagedTag[] };

const WIDE = "(min-width: 900px)";

export function TagsScreen({ groups, tags }: Props) {
  const router = useRouter();
  const id = useId();
  const wide = useMediaQuery(WIDE);
  const [mode, setMode] = useState<"explore" | "manage">("explore");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  // ドロップした並びを、保存して読み直すまで（tags が変わるまで）表示しておく
  const [placed, setPlaced] = useState<{ base: ManagedTag[]; tags: ManagedTag[] } | null>(null);

  const karaoke = planKaraokeTags(groups, tags);
  const selected = tags.find((t) => t.id === selectedId) ?? null;
  const needle = normalizeTagName(q);
  const shown = placed?.base === tags ? placed.tags : tags;
  const { container, drag, rowProps } = useTagDrag(
    mode === "manage" && !needle && !pending,
    dropTag,
  );
  const listed = drag ? placeItem(shown, drag.tagId, drag.groupId, drag.index) : shown;
  const matches = (t: ManagedTag) =>
    !needle ||
    normalizeTagName(t.name).includes(needle) ||
    t.aliases.some((a) => normalizeTagName(a).includes(needle));

  // 表示用のグループ（グループなしのタグは「マイタグ」）
  const sections: { group: GroupOption | null; tags: ManagedTag[] }[] = groups.map((g) => ({
    group: g,
    tags: listed.filter((t) => t.groupId === g.id && matches(t)),
  }));
  const loose = listed.filter(
    (t) => (!t.groupId || !groups.some((g) => g.id === t.groupId)) && matches(t),
  );
  if (loose.length > 0 || (mode === "manage" && !needle))
    sections.push({ group: null, tags: loose });

  function run(fn: () => Promise<{ status: string; message?: string }>, after?: () => void) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (res.status === "ok") {
        after?.();
        router.refresh();
      } else setMessage(res.message ?? "うまくいきませんでした");
    });
  }

  const moveTag = (groupTags: ManagedTag[], tagId: string, dir: -1 | 1) =>
    run(() => reorderTagsAction(moveItem(groupTags, tagId, dir).map((t) => t.id)));
  const moveGroup = (gid: string, dir: -1 | 1) =>
    run(() => reorderGroupsAction(moveItem(groups, gid, dir).map((g) => g.id)));

  function dropTag({ tagId, groupId, index }: TagDrop) {
    const from = shown.find((t) => t.id === tagId);
    const next = placeItem(shown, tagId, groupId, index);
    const ids = next.filter((t) => t.groupId === groupId).map((t) => t.id);
    const before = shown.filter((t) => t.groupId === groupId).map((t) => t.id);
    if (!from || (from.groupId === groupId && ids.join() === before.join())) return;
    setPlaced({ base: tags, tags: next });
    run(async () => {
      const res = await placeTagAction({ id: tagId, groupId, ids });
      if (res.status !== "ok") setPlaced(null);
      return res;
    });
  }

  function openEditor(tagId: string) {
    setSelectedId(tagId);
    if (!wide) dialog.current?.showModal();
  }
  function closeEditor() {
    setSelectedId(null);
    dialog.current?.close();
  }

  const editor = selected && (
    <TagEditor key={selected.id} tag={selected} tags={tags} groups={groups} onClose={closeEditor} />
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="戻る">
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
        </Link>
        <h1>タグ</h1>
        <Link href="/bulk" className={styles.bulkLink}>
          曲のタグを一括変更
        </Link>
        <button
          type="button"
          className={styles.newButton}
          aria-expanded={creating}
          onClick={() => setCreating((v) => !v)}
        >
          ＋ 新規
        </button>
      </header>

      <div className={styles.controls}>
        <div className={styles.segment} role="group" aria-label="表示の切り替え">
          <button
            type="button"
            aria-pressed={mode === "explore"}
            onClick={() => setMode("explore")}
          >
            タグから探す
          </button>
          <button type="button" aria-pressed={mode === "manage"} onClick={() => setMode("manage")}>
            管理
          </button>
        </div>
        <label htmlFor={`${id}-q`} className="visually-hidden">
          タグを検索
        </label>
        <input
          id={`${id}-q`}
          type="search"
          className={styles.search}
          placeholder="タグ名で検索（別名も対象）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {creating && (
        <CreateForms
          groups={groups}
          pending={pending}
          onCreateTag={(name, groupId) =>
            run(
              () => createTagAction({ name, groupId }),
              () => setCreating(false),
            )
          }
          onCreateGroup={(name) =>
            run(
              () => createGroupAction({ name }),
              () => {
                setCreating(false);
                // 「タグから探す」ではタグのないグループを出さないので、作ったグループが見える管理へ
                setMode("manage");
              },
            )
          }
        />
      )}

      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}

      <div className={styles.body}>
        <div className={styles.lists} ref={container}>
          {tags.length === 0 && (
            <p className={styles.empty}>
              タグはまだありません。曲を登録するときや「＋ 新規」から作れます。
            </p>
          )}

          {mode === "explore"
            ? sections
                .filter((s) => s.tags.length > 0)
                .map((s) => (
                  <section key={s.group?.id ?? "loose"} className={styles.group}>
                    <h2>{s.group?.name ?? "マイタグ"}</h2>
                    <div className={styles.chips}>
                      {s.tags.map((t) => (
                        <Link
                          key={t.id}
                          href={conditionsToHref({ ...EMPTY_CONDITIONS, include: [t.id] })}
                          className={styles.chip}
                        >
                          #{t.name}
                          <span>{t.count}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))
            : sections.map((s, gi) => (
                <section key={s.group?.id ?? "loose"} className={styles.group}>
                  <div className={styles.groupHead}>
                    {editingGroup && s.group && editingGroup.id === s.group.id ? (
                      <form
                        className={styles.inline}
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(
                            () => renameGroupAction(editingGroup),
                            () => setEditingGroup(null),
                          );
                        }}
                      >
                        <label className="visually-hidden" htmlFor={`${id}-g-${s.group.id}`}>
                          グループ名
                        </label>
                        <input
                          id={`${id}-g-${s.group.id}`}
                          className={styles.input}
                          value={editingGroup.name}
                          maxLength={GROUP_NAME_MAX}
                          onChange={(e) =>
                            setEditingGroup({ ...editingGroup, name: e.target.value })
                          }
                        />
                        <button type="submit" className={styles.dark} disabled={pending}>
                          保存
                        </button>
                        <button
                          type="button"
                          className={styles.text}
                          onClick={() => setEditingGroup(null)}
                        >
                          やめる
                        </button>
                      </form>
                    ) : (
                      <>
                        <h2>{s.group?.name ?? "マイタグ"}</h2>
                        {s.group && (
                          <div className={styles.groupTools}>
                            <button
                              type="button"
                              aria-label={`${s.group.name}を上へ`}
                              disabled={pending || gi === 0}
                              onClick={() => moveGroup(s.group!.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`${s.group.name}を下へ`}
                              disabled={pending || gi >= groups.length - 1}
                              onClick={() => moveGroup(s.group!.id, 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className={styles.text}
                              onClick={() =>
                                setEditingGroup({ id: s.group!.id, name: s.group!.name })
                              }
                            >
                              名前を変更
                            </button>
                            <button
                              type="button"
                              className={styles.textDanger}
                              disabled={pending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `グループ「${s.group!.name}」を削除しますか？\n中のタグは消えず、「マイタグ」に移ります。`,
                                  )
                                )
                                  run(() => deleteGroupAction(s.group!.id));
                              }}
                            >
                              削除
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <ul
                    className={styles.rows}
                    data-drop-group={s.group?.id ?? ""}
                    data-draggable={needle ? undefined : ""}
                  >
                    {s.tags.length === 0 && <li className={styles.rowEmpty}>タグはありません</li>}
                    {s.tags.map((t, ti) => (
                      <li
                        key={t.id}
                        data-selected={t.id === selectedId ? "" : undefined}
                        data-dragging={t.id === drag?.tagId ? "" : undefined}
                        {...rowProps(t.id, s.group?.id ?? null)}
                      >
                        {!needle && (
                          <span className={styles.grip} aria-hidden="true">
                            ⠿
                          </span>
                        )}
                        <div className={styles.move} data-no-drag="">
                          <button
                            type="button"
                            aria-label={`#${t.name}を上へ`}
                            disabled={pending || ti === 0 || !!needle}
                            onClick={() => moveTag(s.tags, t.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`#${t.name}を下へ`}
                            disabled={pending || ti >= s.tags.length - 1 || !!needle}
                            onClick={() => moveTag(s.tags, t.id, 1)}
                          >
                            ↓
                          </button>
                        </div>
                        <button
                          type="button"
                          className={styles.rowMain}
                          onClick={() => openEditor(t.id)}
                        >
                          <span>#{t.name}</span>
                          <small>{t.count}曲</small>
                        </button>
                        <button
                          type="button"
                          className={styles.edit}
                          aria-label={`#${t.name}を編集`}
                          onClick={() => openEditor(t.id)}
                        >
                          編集
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!needle && (
                    <InlineAdd
                      buttonLabel="＋ タグを追加"
                      inputLabel={`${s.group?.name ?? "マイタグ"}に追加するタグ名`}
                      placeholder="例：高音つらい"
                      maxLength={31}
                      pending={pending}
                      onSubmit={(name, done) =>
                        run(() => createTagAction({ name, groupId: s.group?.id ?? null }), done)
                      }
                    />
                  )}
                </section>
              ))}

          {mode === "manage" && !needle && (
            <section className={styles.group} aria-label="グループの追加">
              <InlineAdd
                buttonLabel="＋ 新しいグループ"
                inputLabel="新しいグループ名"
                placeholder="例：カラオケ機種"
                maxLength={GROUP_NAME_MAX}
                pending={pending}
                onSubmit={(name, done) => run(() => createGroupAction({ name }), done)}
              />
              {karaoke.names.length > 0 && (
                <button
                  type="button"
                  className={styles.addButton}
                  disabled={pending}
                  onClick={() => run(() => addKaraokeTagsAction())}
                >
                  ＋ カラオケ機種のタグ（{karaoke.names.join("・")}）
                </button>
              )}
            </section>
          )}

          {mode === "manage" && (
            <p className={styles.note}>
              タグはドラッグ（スマホは長押ししてから動かす）か↑↓ボタンで並べ替えられます。別のグループまでドラッグすると、そのグループへ移ります。「＋
              新しいグループ」でグループを作れます。「＋
              カラオケ機種のタグ」で、曲が入っている機種（DAM・JOYSOUND）を付けるためのタグをまとめて作れます。タグの「編集」では、グループの移動（新しいグループを作って移すことも）・名前変更・統合・削除ができます。タグを削除しても曲は消えません。
            </p>
          )}
        </div>

        {wide && (
          <aside className={styles.aside} aria-label="タグの編集">
            {editor ?? (
              <p className={styles.note}>管理モードでタグを選ぶと、ここで編集できます。</p>
            )}
          </aside>
        )}
      </div>

      <dialog
        ref={dialog}
        className={styles.dialog}
        onClose={() => setSelectedId(null)}
        aria-label="タグの編集"
      >
        {!wide && editor}
      </dialog>
    </div>
  );
}

function CreateForms({
  groups,
  pending,
  onCreateTag,
  onCreateGroup,
}: {
  groups: GroupOption[];
  pending: boolean;
  onCreateTag: (name: string, groupId: string | null) => void;
  onCreateGroup: (name: string) => void;
}) {
  const id = useId();
  const [tag, setTag] = useState("");
  const [group, setGroup] = useState("");
  const [gname, setGname] = useState("");
  return (
    <div className={styles.create}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreateTag(tag, group || null);
        }}
      >
        <label htmlFor={`${id}-t`}>新しいタグ</label>
        <div className={styles.inline}>
          <input
            id={`${id}-t`}
            className={styles.input}
            value={tag}
            maxLength={31}
            onChange={(e) => setTag(e.target.value)}
            placeholder="例：高音つらい"
          />
          <label htmlFor={`${id}-g`} className="visually-hidden">
            グループ
          </label>
          <select
            id={`${id}-g`}
            className={styles.input}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">マイタグ</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.dark} disabled={pending || !tag.trim()}>
            追加
          </button>
        </div>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreateGroup(gname);
        }}
      >
        <label htmlFor={`${id}-n`}>新しいグループ</label>
        <div className={styles.inline}>
          <input
            id={`${id}-n`}
            className={styles.input}
            value={gname}
            maxLength={GROUP_NAME_MAX}
            onChange={(e) => setGname(e.target.value)}
            placeholder="例：カラオケ機種"
          />
          <button type="submit" className={styles.dark} disabled={pending || !gname.trim()}>
            追加
          </button>
        </div>
      </form>
    </div>
  );
}

/** ボタンを押すと1行の入力欄に変わる追加フォーム（管理モードのグループ・タグの追加） */
function InlineAdd({
  buttonLabel,
  inputLabel,
  placeholder,
  maxLength,
  pending,
  onSubmit,
}: {
  buttonLabel: string;
  inputLabel: string;
  placeholder: string;
  maxLength: number;
  pending: boolean;
  onSubmit: (value: string, done: () => void) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open)
    return (
      <button type="button" className={styles.addButton} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
    );

  const close = () => {
    setValue("");
    setOpen(false);
  };
  return (
    <form
      className={styles.inline}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value, close);
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        {inputLabel}
      </label>
      <input
        id={id}
        className={styles.input}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      />
      <button type="submit" className={styles.dark} disabled={pending || !value.trim()}>
        追加
      </button>
      <button type="button" className={styles.text} onClick={close}>
        やめる
      </button>
    </form>
  );
}
