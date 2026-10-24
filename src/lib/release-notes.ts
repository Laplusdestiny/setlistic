// 更新履歴（ヘルプの「更新履歴」に表示する）。新しい順に並べる。
// 利用者に見える変更を入れる PR で、package.json の version とあわせて1件足す（.claude/skills/release-bump を参照）。
// 書き方：PR の技術的な説明ではなく、利用者向けの言葉で「〜できるようにしました」「〜を直しました」と書く。

export type ReleaseChangeKind = "feature" | "change" | "fix";

export type ReleaseChange = { kind: ReleaseChangeKind; text: string };

export type Release = {
  /** semver（x.y.z）。package.json の version と最新のものをそろえる */
  version: string;
  /** YYYY-MM-DD（バージョンを上げた日） */
  date: string;
  /** 見出しに添える一言（任意） */
  title?: string;
  changes: ReleaseChange[];
};

export const RELEASE_KIND_LABELS: Record<ReleaseChangeKind, string> = {
  feature: "新機能",
  change: "変更",
  fix: "不具合の修正",
};

const KIND_ORDER: ReleaseChangeKind[] = ["feature", "change", "fix"];

export const RELEASES: Release[] = [
  {
    version: "0.7.0",
    date: "2026-10-24",
    changes: [{ kind: "feature", text: "ヘルプに、この更新履歴を載せました" }],
  },
  {
    version: "0.6.0",
    date: "2026-10-19",
    changes: [
      {
        kind: "feature",
        text: "タグ管理で、タグをドラッグして並べ替えられるようにしました。スマホでは長押ししてから動かします。別のグループへ動かすと、そのグループへ移ります",
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-10-18",
    changes: [
      {
        kind: "feature",
        text: "初めてログインしたときに、使い方を案内するチュートリアルを出すようにしました。設定からいつでも見返せます",
      },
      { kind: "feature", text: "このヘルプページを追加しました" },
      {
        kind: "change",
        text: "公開URLを setlistic.laplusdestiny.com に変えました。前のURLを開いても新しいURLへ自動で移ります",
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-10-16",
    changes: [
      {
        kind: "feature",
        text: "「ランダム」で1曲選ぶとき、スロットのように曲名が回って止まる演出を出すようにしました。「もう一回」で選び直せます。端末で動きを減らす設定にしていると、演出なしで結果だけを出します",
      },
    ],
  },
  {
    version: "0.3.1",
    date: "2026-10-15",
    changes: [
      {
        kind: "fix",
        text: "曲を追加したあとに登録画面を開き直すと、前の曲の確認画面が残っていた問題を直しました",
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-10-13",
    changes: [
      {
        kind: "feature",
        text: "セトリを読み込んでいるあいだ、真っ白な画面ではなく、アイコンとセトリの形をした仮の表示を出すようにしました",
      },
      { kind: "fix", text: "iPhone で、歌唱記録の日付欄が右にはみ出ていたのを直しました" },
      {
        kind: "fix",
        text: "Android で、並び替えメニューがタグの下に隠れて押せなかったのを直しました",
      },
      { kind: "fix", text: "ログイン画面の説明文が、語の途中で改行されていたのを直しました" },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-12",
    changes: [
      {
        kind: "feature",
        text: "Spotify と YouTube Music の共有URLから曲を登録できるようにしました",
      },
      {
        kind: "feature",
        text: "カラオケ機種のタグ（DAM・JOYSOUND）を、タグ管理のボタンからまとめて作れるようにしました",
      },
      { kind: "feature", text: "タグ管理の画面から、新しいグループをその場で作れるようにしました" },
      {
        kind: "feature",
        text: "LINE や X でリンクを共有したときに、サイトの説明と画像が出るようにしました",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-10-12",
    title: "最初の公開",
    changes: [
      { kind: "feature", text: "Google アカウントでのログイン（招待制）" },
      {
        kind: "feature",
        text: "曲の登録：Apple Music の共有URL、曲名での検索、手入力、まとめて登録",
      },
      {
        kind: "feature",
        text: "セトリ（曲の一覧）・曲の詳細・編集、「今日歌った！」で歌った記録を残す",
      },
      { kind: "feature", text: "検索・絞り込み・並べ替え・ランダム" },
      {
        kind: "feature",
        text: "タグ：入力中に過去のタグを候補に出す、グループ分け、複数の曲のタグをまとめて変える",
      },
      { kind: "feature", text: "データの書き出し（JSON・CSV）と取り込み、アカウントの削除" },
      { kind: "feature", text: "ホーム画面に追加して、アプリのように使える" },
      { kind: "feature", text: "登録できる曲は1人2,000曲まで" },
    ],
  },
];

/** 最初から開いて見せる件数。それより古いものは畳む */
export const RELEASES_OPEN_COUNT = 3;

export const currentVersion = () => RELEASES[0].version;

/** 変更を種類ごと（新機能 → 変更 → 修正）にまとめる。空の種類は出さない */
export function groupReleaseChanges(release: Release) {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: RELEASE_KIND_LABELS[kind],
    items: release.changes.filter((c) => c.kind === kind).map((c) => c.text),
  })).filter((g) => g.items.length > 0);
}

/** "1.2.3" を比較用の数の組にする。形が違えば null */
export function parseVersion(version: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a が b より新しければ正、古ければ負、同じなら0 */
export function compareVersions(a: string, b: string) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error(`バージョンの形が違います: ${a} / ${b}`);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
