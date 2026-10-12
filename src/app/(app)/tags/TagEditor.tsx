"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { conditionsToHref, EMPTY_CONDITIONS } from "@/lib/search/conditions";
import type { GroupOption } from "@/lib/tags/types";
import { GROUP_NAME_MAX } from "@/lib/tags/manage";
import {
  addAliasAction,
  createGroupAction,
  deleteTagAction,
  mergeTagsAction,
  moveTagAction,
  removeAliasAction,
  renameTagAction,
} from "./actions";
import type { ManagedTag } from "./TagsScreen";
import styles from "./tags.module.css";

type Props = {
  tag: ManagedTag;
  tags: ManagedTag[];
  groups: GroupOption[];
  onClose: () => void;
};

type Res = { status: string; message?: string };

// グループの選択肢に混ぜる「新しいグループを作る」の値（UUID と重ならない）
const NEW_GROUP = "__new__";

/** タグの編集（名前・グループ・別名・統合・削除）。PC では右パネル、スマホではダイアログに出す */
export function TagEditor({ tag, tags, groups, onClose }: Props) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(tag.name);
  const [alias, setAlias] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<Res>, okText: string, after?: () => void) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (res.status === "ok") {
        setMessage({ kind: "ok", text: okText });
        after?.();
        router.refresh();
      } else setMessage({ kind: "error", text: res.message ?? "うまくいきませんでした" });
    });
  }

  const others = tags.filter((t) => t.id !== tag.id);

  return (
    <div className={styles.editor}>
      <div className={styles.editorHead}>
        <h2>#{tag.name} を編集</h2>
        <button type="button" className={styles.text} onClick={onClose}>
          閉じる
        </button>
      </div>

      <form
        className={styles.field}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => renameTagAction({ id: tag.id, name }), "名前を変更しました");
        }}
      >
        <label htmlFor={`${id}-n`}>タグ名</label>
        <div className={styles.inline}>
          <input
            id={`${id}-n`}
            className={styles.input}
            value={name}
            maxLength={31}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className={styles.dark}
            disabled={pending || !name.trim() || name === tag.name}
          >
            保存
          </button>
        </div>
      </form>

      <div className={styles.field}>
        <label htmlFor={`${id}-g`}>グループ</label>
        <select
          id={`${id}-g`}
          className={styles.input}
          value={newGroup !== null ? NEW_GROUP : (tag.groupId ?? "")}
          disabled={pending}
          onChange={(e) => {
            if (e.target.value === NEW_GROUP) return setNewGroup("");
            setNewGroup(null);
            run(
              () => moveTagAction({ id: tag.id, groupId: e.target.value || null }),
              "グループを移しました",
            );
          }}
        >
          <option value="">マイタグ（グループなし）</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value={NEW_GROUP}>＋ 新しいグループを作る</option>
        </select>
        {newGroup !== null && (
          <form
            className={styles.inline}
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => createGroupAction({ name: newGroup, tagId: tag.id }),
                "グループを作って移しました",
                () => setNewGroup(null),
              );
            }}
          >
            <label htmlFor={`${id}-ng`} className="visually-hidden">
              新しいグループ名
            </label>
            <input
              id={`${id}-ng`}
              className={styles.input}
              value={newGroup}
              maxLength={GROUP_NAME_MAX}
              placeholder="新しいグループ名"
              autoFocus
              onChange={(e) => setNewGroup(e.target.value)}
            />
            <button type="submit" className={styles.dark} disabled={pending || !newGroup.trim()}>
              作成
            </button>
            <button type="button" className={styles.text} onClick={() => setNewGroup(null)}>
              やめる
            </button>
          </form>
        )}
      </div>

      <div className={styles.field}>
        <span id={`${id}-a`}>別名</span>
        <p className={styles.hint}>検索でヒットさせる言い換え（例：「十八番」に「おはこ」）</p>
        {tag.aliases.length > 0 && (
          <ul className={styles.aliases} aria-labelledby={`${id}-a`}>
            {tag.aliases.map((a) => (
              <li key={a}>
                {a}
                <button
                  type="button"
                  aria-label={`別名「${a}」を削除`}
                  disabled={pending}
                  onClick={() =>
                    run(() => removeAliasAction({ tagId: tag.id, alias: a }), "別名を削除しました")
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addAliasAction({ tagId: tag.id, alias }),
              "別名を追加しました",
              () => setAlias(""),
            );
          }}
        >
          <label htmlFor={`${id}-al`} className="visually-hidden">
            別名を追加
          </label>
          <input
            id={`${id}-al`}
            className={styles.input}
            value={alias}
            maxLength={31}
            placeholder="別名を入力"
            onChange={(e) => setAlias(e.target.value)}
          />
          <button type="submit" className={styles.dark} disabled={pending || !alias.trim()}>
            追加
          </button>
        </form>
      </div>

      <div className={styles.field}>
        <span>このタグの曲（{tag.count}曲）</span>
        <Link href={conditionsToHref({ ...EMPTY_CONDITIONS, include: [tag.id] })}>
          セトリでこのタグを開く
        </Link>
      </div>

      {others.length > 0 && (
        <div className={styles.field}>
          <label htmlFor={`${id}-m`}>別のタグに統合</label>
          <p className={styles.hint}>
            このタグの曲を、選んだタグに移します。このタグの名前は、統合先の別名として残ります。
          </p>
          <div className={styles.inline}>
            <select
              id={`${id}-m`}
              className={styles.input}
              value={mergeTo}
              onChange={(e) => setMergeTo(e.target.value)}
            >
              <option value="">統合先を選ぶ</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.secondary}
              disabled={pending || !mergeTo}
              onClick={() => {
                const target = others.find((t) => t.id === mergeTo);
                if (
                  target &&
                  window.confirm(
                    `「#${tag.name}」を「#${target.name}」に統合しますか？\nこの操作は元に戻せません。`,
                  )
                )
                  run(
                    () => mergeTagsAction({ sourceId: tag.id, targetId: mergeTo }),
                    "統合しました",
                    onClose,
                  );
              }}
            >
              統合
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={message.kind === "error" ? styles.error : styles.okMessage}
        >
          {message.text}
        </p>
      )}

      <button
        type="button"
        className={styles.danger}
        disabled={pending}
        onClick={() => {
          if (
            window.confirm(
              `タグ「#${tag.name}」を削除しますか？\n${tag.count}曲からこのタグが外れます（曲は消えません）。`,
            )
          )
            run(() => deleteTagAction(tag.id), "削除しました", onClose);
        }}
      >
        このタグを削除
      </button>
    </div>
  );
}
