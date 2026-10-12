"use client";

import { useId } from "react";
import type { CustomField } from "@/lib/custom-fields";
import form from "./form.module.css";
import styles from "./field-inputs.module.css";

type Props = {
  fields: CustomField[];
  /** 項目ID → 入力中の値（数値は文字列のまま持つ。サーバーで整える） */
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
};

/** カスタム項目の入力欄（登録・編集フォームで共通） */
export function FieldInputs({ fields, values, onChange }: Props) {
  const prefix = useId();
  if (fields.length === 0) return null;

  return (
    <div className={styles.root}>
      {fields.map((f) => {
        const id = `${prefix}-${f.id}`;
        const v = values[f.id];

        if (f.type === "multi_select") {
          const picked = Array.isArray(v) ? (v as string[]) : [];
          return (
            <fieldset key={f.id} className={styles.fieldset}>
              <legend className={form.label}>{f.name}</legend>
              <div className={form.chips}>
                {f.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={form.chip}
                    aria-pressed={picked.includes(o)}
                    onClick={() =>
                      onChange(
                        f.id,
                        picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o],
                      )
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        }

        if (f.type === "checkbox") {
          return (
            <label key={f.id} className={styles.check}>
              <input
                type="checkbox"
                checked={v === true}
                onChange={(e) => onChange(f.id, e.target.checked)}
              />
              {f.name}
            </label>
          );
        }

        return (
          <div key={f.id} className={styles.row}>
            <label htmlFor={id} className={form.label}>
              {f.name}
            </label>
            {f.type === "select" ? (
              <select
                id={id}
                className={form.input}
                value={typeof v === "string" ? v : ""}
                onChange={(e) => onChange(f.id, e.target.value)}
              >
                <option value="">未設定</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                className={form.input}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                step={f.type === "number" ? "any" : undefined}
                maxLength={f.type === "text" ? 200 : undefined}
                value={v === null || v === undefined ? "" : String(v)}
                onChange={(e) => onChange(f.id, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
