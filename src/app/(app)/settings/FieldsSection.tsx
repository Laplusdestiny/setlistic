"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  FIELD_MAX_COUNT,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  parseOptionsText,
  type CustomField,
  type FieldType,
} from "@/lib/custom-fields";
import { moveItem } from "@/lib/tags/manage";
import {
  createFieldAction,
  deleteFieldAction,
  reorderFieldsAction,
  updateFieldAction,
} from "./actions";
import styles from "./settings.module.css";

type Res = { status: string; message?: string };
const hasOptions = (t: FieldType) => t === "select" || t === "multi_select";

export function FieldsSection({ fields }: { fields: CustomField[] }) {
  const router = useRouter();
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; options: string } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<Res>, after?: () => void) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (res.status === "ok") {
        after?.();
        router.refresh();
      } else setMessage(res.message ?? "うまくいきませんでした");
    });
  }

  const patch = (f: CustomField, over: Partial<{ showInList: boolean; hidden: boolean }>) =>
    run(() =>
      updateFieldAction({
        id: f.id,
        name: f.name,
        showInList: f.showInList,
        hidden: f.hidden,
        ...over,
      }),
    );

  return (
    <section id="fields" className={styles.card} aria-labelledby="fields-h">
      <div className={styles.cardHead}>
        <div>
          <h2 id="fields-h">カスタム項目</h2>
          <p className={styles.hint}>
            曲ごとに記録する項目（最高点・採点機種など）。曲名・アーティスト・タグ・キー・メモは固定です。
          </p>
        </div>
        <button
          type="button"
          className={styles.dark}
          disabled={fields.length >= FIELD_MAX_COUNT}
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
        >
          ＋ 項目を追加
        </button>
      </div>

      {adding && (
        <form
          className={styles.subForm}
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createFieldAction({ name, type, options: parseOptionsText(options) }),
              () => {
                setName("");
                setOptions("");
                setType("text");
                setAdding(false);
              },
            );
          }}
        >
          <div className={styles.field}>
            <label htmlFor={`${id}-n`}>項目名</label>
            <input
              id={`${id}-n`}
              className={styles.input}
              value={name}
              maxLength={30}
              placeholder="例：最高点"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-t`}>種類</label>
            <select
              id={`${id}-t`}
              className={styles.input}
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <p className={styles.hint}>種類はあとから変えられません。</p>
          </div>
          {hasOptions(type) && (
            <div className={styles.field}>
              <label htmlFor={`${id}-o`}>選択肢（1行に1つ）</label>
              <textarea
                id={`${id}-o`}
                className={styles.input}
                rows={4}
                value={options}
                placeholder={"DAM\nJOYSOUND"}
                onChange={(e) => setOptions(e.target.value)}
              />
            </div>
          )}
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary} disabled={pending || !name.trim()}>
              追加
            </button>
            <button type="button" className={styles.secondary} onClick={() => setAdding(false)}>
              やめる
            </button>
          </div>
        </form>
      )}

      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}

      {fields.length === 0 ? (
        <p className={styles.hint}>まだ項目がありません。</p>
      ) : (
        <ul className={styles.fieldList}>
          {fields.map((f, i) => (
            <li key={f.id}>
              {editing?.id === f.id ? (
                <form
                  className={styles.subForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () =>
                        updateFieldAction({
                          id: f.id,
                          name: editing.name,
                          options: hasOptions(f.type)
                            ? parseOptionsText(editing.options)
                            : undefined,
                          showInList: f.showInList,
                          hidden: f.hidden,
                        }),
                      () => setEditing(null),
                    );
                  }}
                >
                  <div className={styles.field}>
                    <label htmlFor={`${id}-en-${f.id}`}>
                      項目名（{FIELD_TYPE_LABELS[f.type]}）
                    </label>
                    <input
                      id={`${id}-en-${f.id}`}
                      className={styles.input}
                      value={editing.name}
                      maxLength={30}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </div>
                  {hasOptions(f.type) && (
                    <div className={styles.field}>
                      <label htmlFor={`${id}-eo-${f.id}`}>選択肢（1行に1つ）</label>
                      <textarea
                        id={`${id}-eo-${f.id}`}
                        className={styles.input}
                        rows={4}
                        value={editing.options}
                        onChange={(e) => setEditing({ ...editing, options: e.target.value })}
                      />
                      <p className={styles.hint}>選択肢を消しても、すでに入力した値は残ります。</p>
                    </div>
                  )}
                  <div className={styles.buttons}>
                    <button
                      type="submit"
                      className={styles.primary}
                      disabled={pending || !editing.name.trim()}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setEditing(null)}
                    >
                      やめる
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className={styles.fieldMain}>
                    <strong>
                      {f.name}
                      {f.hidden && <small>（非表示）</small>}
                    </strong>
                    <span>
                      {FIELD_TYPE_LABELS[f.type]}
                      {hasOptions(f.type) && f.options.length > 0
                        ? `：${f.options.join("・")}`
                        : ""}
                    </span>
                  </div>
                  <div className={styles.fieldTools}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={f.showInList}
                        disabled={pending || f.hidden}
                        onChange={(e) => patch(f, { showInList: e.target.checked })}
                      />
                      一覧に表示
                    </label>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={f.hidden}
                        disabled={pending}
                        onChange={(e) => patch(f, { hidden: e.target.checked })}
                      />
                      非表示
                    </label>
                    <button
                      type="button"
                      aria-label={`${f.name}を上へ`}
                      disabled={pending || i === 0}
                      onClick={() =>
                        run(() => reorderFieldsAction(moveItem(fields, f.id, -1).map((x) => x.id)))
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${f.name}を下へ`}
                      disabled={pending || i === fields.length - 1}
                      onClick={() =>
                        run(() => reorderFieldsAction(moveItem(fields, f.id, 1).map((x) => x.id)))
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() =>
                        setEditing({ id: f.id, name: f.name, options: f.options.join("\n") })
                      }
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className={styles.linkDanger}
                      disabled={pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `項目「${f.name}」を削除しますか？\nすべての曲のこの項目の値も消えます。`,
                          )
                        )
                          run(() => deleteFieldAction(f.id));
                      }}
                    >
                      削除
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
