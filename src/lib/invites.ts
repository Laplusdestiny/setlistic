export const INVITE_LABEL_MAX = 30;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** 招待の入力検証。メールは前後の空白を除いて小文字にする（DB側のハッシュ計算と同じ） */
export function validateInvite(raw: unknown): Result<{ email: string; label: string | null }> {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, error: "入力が正しくありません" };
  const r = raw as Record<string, unknown>;

  const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
  if (!email) return { ok: false, error: "メールアドレスを入力してください" };
  if (email.length > 254 || !EMAIL.test(email))
    return { ok: false, error: "メールアドレスの形式が正しくありません" };

  const label = typeof r.label === "string" ? r.label.trim().replace(/\s+/g, " ") : "";
  if ([...label].length > INVITE_LABEL_MAX)
    return { ok: false, error: `メモは${INVITE_LABEL_MAX}文字までです` };
  return { ok: true, value: { email, label: label || null } };
}

/** 招待した相手に送る案内文 */
export function inviteMessage(origin: string): string {
  return [
    "Setlistic（カラオケの曲を登録・検索するアプリ）に招待しました。",
    "",
    `1. こちらを開いてください：${origin}`,
    "2. 「Googleでサインイン」を押して、招待したメールアドレスのGoogleアカウントでログインします。",
    "3. iPhoneは、Safariの共有ボタン →「ホーム画面に追加」で、アプリのように使えます。",
    "",
    "招待制のため、別のGoogleアカウントでは入れません。",
  ].join("\n");
}

export type InviteRow = {
  emailHash: string;
  label: string | null;
  invitedAt: string;
  userId: string | null;
  lastSignInAt: string | null;
  isSelf: boolean;
};

/** まだログインしていない（招待だけの）状態か */
export const isPending = (r: Pick<InviteRow, "userId">) => r.userId === null;

/** 画面で見分けるための短い識別子（ハッシュの先頭6文字。メールアドレスではない） */
export const shortHash = (hash: string) => hash.slice(0, 6);
