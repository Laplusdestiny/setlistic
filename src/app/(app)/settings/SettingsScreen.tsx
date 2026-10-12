"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { signOut } from "@/app/login/actions";
import type { CustomField } from "@/lib/custom-fields";
import type { UserSettings } from "@/lib/songs/queries";
import { SORT_KEYS, SORT_LABELS } from "@/lib/songs/sort";
import type { GroupOption, TagOption } from "@/lib/tags/types";
import { DangerSection } from "./DangerSection";
import { DataSection } from "./DataSection";
import { FieldsSection } from "./FieldsSection";
import { saveDisplaySettingsAction } from "./actions";
import styles from "./settings.module.css";

type Props = {
  email: string;
  settings: UserSettings;
  fields: CustomField[];
  tags: TagOption[];
  groups: GroupOption[];
};

const NAV = [
  { href: "#account", label: "アカウント" },
  { href: "#fields", label: "カスタム項目" },
  { href: "#view", label: "表示" },
  { href: "#data", label: "データ" },
  { href: "#danger", label: "アカウントの削除" },
] as const;

export function SettingsScreen({ email, settings, fields, tags, groups }: Props) {
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
        <h1>設定</h1>
      </header>

      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="設定の項目">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>

        <div className={styles.sections}>
          <section id="account" className={styles.card} aria-labelledby="account-h">
            <h2 id="account-h">アカウント</h2>
            <dl className={styles.dl}>
              <div>
                <dt>メールアドレス</dt>
                <dd>{email || "—"}</dd>
              </div>
              <div>
                <dt>ログイン方法</dt>
                <dd>Google</dd>
              </div>
            </dl>
            <form action={signOut}>
              <button type="submit" className={styles.secondary}>
                ログアウト
              </button>
            </form>
          </section>

          <FieldsSection fields={fields} />

          <DisplaySection settings={settings} tags={tags} groups={groups} />

          <DataSection />

          <DangerSection />

          <section className={styles.card} aria-labelledby="links-h">
            <h2 id="links-h">そのほか</h2>
            <p className={styles.links}>
              <Link href="/tags">タグの管理</Link>
              <Link href="/bulk">タグの一括変更（複数の曲にまとめて付ける・外す）</Link>
              <Link href="/terms">利用規約</Link>
              <Link href="/privacy">プライバシーポリシー</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function DisplaySection({
  settings,
  tags,
  groups,
}: {
  settings: UserSettings;
  tags: TagOption[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const id = useId();
  const [sort, setSort] = useState(settings.listSort);
  const [columns, setColumns] = useState(settings.listColumns);
  const [defaults, setDefaults] = useState(settings.defaultTagIds);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  const byGroup = groups
    .map((g) => ({ name: g.name, tags: tags.filter((t) => t.groupId === g.id) }))
    .filter((g) => g.tags.length > 0);
  const loose = tags.filter((t) => !t.groupId || !groups.some((g) => g.id === t.groupId));
  if (loose.length) byGroup.push({ name: "マイタグ", tags: loose });

  function save() {
    setMessage(null);
    start(async () => {
      const res = await saveDisplaySettingsAction({
        listSort: sort,
        listColumns: columns,
        defaultTagIds: defaults,
      });
      if (res.status === "ok") {
        setMessage({ kind: "ok", text: "保存しました" });
        router.refresh();
      } else setMessage({ kind: "error", text: res.message });
    });
  }

  return (
    <section id="view" className={styles.card} aria-labelledby="view-h">
      <h2 id="view-h">表示と登録</h2>

      <div className={styles.field}>
        <label htmlFor={`${id}-sort`}>一覧の並び順（既定）</label>
        <select
          id={`${id}-sort`}
          className={styles.input}
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>一覧に表示する項目</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={columns.includes("key")}
            onChange={() => setColumns(toggle(columns, "key"))}
          />
          キー
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={columns.includes("tags")}
            onChange={() => setColumns(toggle(columns, "tags"))}
          />
          タグ
        </label>
        <p className={styles.hint}>
          カスタム項目は、上の「カスタム項目」で「一覧に表示」を選んだものが出ます。
        </p>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>登録時に付けるタグ</legend>
        <p className={styles.hint}>曲を登録するときに、最初から選ばれているタグです。</p>
        {tags.length === 0 ? (
          <p className={styles.hint}>タグがまだありません。</p>
        ) : (
          byGroup.map((g) => (
            <div key={g.name} className={styles.tagGroup}>
              <span>{g.name}</span>
              <div className={styles.chips}>
                {g.tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={styles.chip}
                    aria-pressed={defaults.includes(t.id)}
                    onClick={() => setDefaults(toggle(defaults, t.id))}
                  >
                    #{t.name}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </fieldset>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={message.kind === "error" ? styles.error : styles.ok}
        >
          {message.text}
        </p>
      )}
      <button type="button" className={styles.primary} disabled={pending} onClick={save}>
        {pending ? "保存中…" : "保存"}
      </button>
    </section>
  );
}
