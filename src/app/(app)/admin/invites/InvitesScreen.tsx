"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { inviteMessage, isPending, shortHash, type InviteRow } from "@/lib/invites";
import { addInviteAction, revokeInviteAction } from "./actions";
import styles from "./invites.module.css";

const dateJa = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

export function InvitesScreen({ invites }: { invites: InviteRow[] }) {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [added, setAdded] = useState<string | null>(null); // 追加した直後に出す案内文
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    setCopied(false);
    start(async () => {
      const res = await addInviteAction({ email, label });
      if (res.status === "ok") {
        setAdded(inviteMessage(window.location.origin));
        setEmail("");
        setLabel("");
        router.refresh();
      } else setError(res.message);
    });
  }

  function revoke(row: InviteRow, deleteUser: boolean) {
    const who = row.label ? `「${row.label}」` : `識別 ${shortHash(row.emailHash)}`;
    const ok = window.confirm(
      deleteUser
        ? `${who} のアクセスを止めます。\nアカウントと、登録した曲・タグなどのデータがすべて削除されます。元に戻せません。\n（必要なら、先に相手にエクスポートしてもらってください）\n\n続けますか？`
        : `${who} の招待を取り消しますか？`,
    );
    if (!ok) return;
    setError(null);
    start(async () => {
      const res = await revokeInviteAction({ hash: row.emailHash, deleteUser });
      if (res.status === "ok") router.refresh();
      else setError(res.message);
    });
  }

  async function copy() {
    if (!added) return;
    try {
      await navigator.clipboard.writeText(added);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (added && navigator.share) {
      try {
        await navigator.share({ text: added });
      } catch {
        // キャンセルは何もしない
      }
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/settings" className={styles.back} aria-label="戻る">
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
        <h1>招待の管理</h1>
      </header>

      <div className={styles.body}>
        <section className={styles.card} aria-labelledby={`${id}-add`}>
          <h2 id={`${id}-add`}>人を招待する</h2>
          <p className={styles.hint}>
            招待したい人の Google
            アカウントのメールアドレスを入力します。メールアドレスは保存されず、判定用の値（ハッシュ）だけが残ります。
          </p>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <div className={styles.field}>
              <label htmlFor={`${id}-e`}>メールアドレス</label>
              <input
                id={`${id}-e`}
                type="email"
                className={styles.input}
                value={email}
                autoComplete="off"
                autoCapitalize="none"
                inputMode="email"
                placeholder="friend@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-l`}>メモ（任意・自分用の目印）</label>
              <input
                id={`${id}-l`}
                className={styles.input}
                value={label}
                maxLength={30}
                placeholder="例：大学の友人"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <button type="submit" className={styles.primary} disabled={pending || !email.trim()}>
              {pending ? "追加中…" : "招待する"}
            </button>
          </form>

          {added && (
            <div className={styles.done} role="status">
              <p>
                <strong>招待を追加しました。</strong>下の案内文を相手に送ってください。
              </p>
              <label htmlFor={`${id}-m`} className="visually-hidden">
                相手に送る案内文
              </label>
              <textarea
                id={`${id}-m`}
                className={styles.message}
                readOnly
                rows={8}
                value={added}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className={styles.buttons}>
                <button type="button" className={styles.secondary} onClick={copy}>
                  {copied ? "コピーしました" : "案内文をコピー"}
                </button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button type="button" className={styles.secondary} onClick={share}>
                    共有する
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <details className={styles.check}>
          <summary>招待する前のチェック</summary>
          <ul>
            <li>
              Google の OAuth
              同意画面が「テスト」のままだと、テストユーザーに追加した人しかログインできません。「本番環境」にするか、相手をテストユーザーに追加してください。
            </li>
            <li>
              利用規約・プライバシーポリシー（<Link href="/terms">利用規約</Link>・
              <Link href="/privacy">プライバシー</Link>
              ）の内容を確認してください。相手はこれに同意して使います。
            </li>
            <li>
              独自ドメインを使う場合は、Supabase の Site URL / Redirect URLs にも追加してください。
            </li>
          </ul>
        </details>

        <section className={styles.card} aria-labelledby={`${id}-list`}>
          <h2 id={`${id}-list`}>招待した人（{invites.length}）</h2>
          {invites.length === 0 ? (
            <p className={styles.hint}>まだ招待していません。</p>
          ) : (
            <ul className={styles.list}>
              {invites.map((r) => (
                <li key={r.emailHash}>
                  <div className={styles.rowMain}>
                    <strong>{r.label ?? "（メモなし）"}</strong>
                    {r.isSelf && <span className={styles.badgeSelf}>あなた</span>}
                    {isPending(r) ? (
                      <span className={styles.badgePending}>まだログインしていません</span>
                    ) : (
                      <span className={styles.badgeActive}>
                        利用中{r.lastSignInAt ? `（最終ログイン ${dateJa(r.lastSignInAt)}）` : ""}
                      </span>
                    )}
                    <small>
                      招待日 {dateJa(r.invitedAt)} ／ 識別 {shortHash(r.emailHash)}
                    </small>
                  </div>
                  {!r.isSelf && (
                    <div className={styles.rowTools}>
                      {isPending(r) ? (
                        <button
                          type="button"
                          className={styles.dangerLink}
                          disabled={pending}
                          onClick={() => revoke(r, false)}
                        >
                          招待を取り消す
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.dangerLink}
                          disabled={pending}
                          onClick={() => revoke(r, true)}
                        >
                          アクセスを止める
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className={styles.hint}>
            「アクセスを止める」は、その人のアカウントと全データを削除します。許可リストから外すだけでは、すでに作られたアカウントはログインできてしまうためです。
          </p>
        </section>
      </div>
    </div>
  );
}
