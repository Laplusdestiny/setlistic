"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { helpHref } from "@/lib/help";
import { supportedServicesText } from "@/lib/songs/services";
import {
  nextTutorialStep,
  pad2,
  stepPosition,
  tutorialHref,
  tutorialSteps,
  type TutorialStep,
} from "@/lib/tutorial";
import { completeTutorialAction, registerFirstSongAction } from "./actions";
import styles from "./tutorial.module.css";

type Song = { id: string; title: string; artist: string };

type Props = {
  step: TutorialStep;
  /** 完了画面に出す、登録した曲 */
  song: Song | null;
};

const noSubscribe = () => () => {};

/** ホーム画面から起動しているか（iOS Safari は navigator.standalone） */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function Tutorial({ step, song }: Props) {
  const router = useRouter();
  // サーバーでは分からないので、最初は「ブラウザで開いている」として描き、読み込み後に決める
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => false);
  const steps = tutorialSteps(standalone);
  const { current, total } = stepPosition(steps, step);
  const [leaving, startLeaving] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);

  // ホーム画面から起動しているときは「ホーム画面に追加できます」を飛ばす（URL を直接開いたときも）
  useEffect(() => {
    if (standalone && step === "home") router.replace(tutorialHref("register"));
  }, [standalone, step, router]);

  // 手順が変わるたびに見出しへフォーカスを移す（読み上げで今の手順が分かるように）
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const next = () => {
    const to = nextTutorialStep(steps, step);
    if (to) router.push(tutorialHref(to));
  };

  /** スキップ・あとで登録する：完了を記録して曲一覧へ */
  const leave = () =>
    startLeaving(async () => {
      await completeTutorialAction();
      router.push("/");
    });

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <header className={styles.bar}>
          <p className={styles.step} aria-label={`ステップ ${current} / ${total}`}>
            STEP {pad2(current)} / {pad2(total)}
          </p>
          {step !== "done" && (
            <button type="button" className={styles.skip} onClick={leave} disabled={leaving}>
              スキップ
            </button>
          )}
        </header>

        {step === "welcome" && (
          <>
            <main className={styles.body} key={step}>
              <SetlistPaper />
              <h1 ref={heading} tabIndex={-1} className={styles.title}>
                ようこそ、
                <br />
                Setlisticへ
              </h1>
              <p className={styles.lead}>
                歌える曲をタグで整理して、カラオケで「何歌おう…」と迷わないためのメモ帳です。
              </p>
            </main>
            <footer className={styles.actions}>
              <button type="button" className={styles.primary} onClick={next}>
                はじめる
              </button>
              <p className={styles.note}>このガイドは設定からいつでも見返せます</p>
            </footer>
          </>
        )}

        {step === "home" && (
          <>
            <main className={styles.body} key={step}>
              <HomeGrid />
              <h1 ref={heading} tabIndex={-1} className={styles.title}>
                ホーム画面に追加すると、アプリのように使えます
              </h1>
              <p className={styles.lead}>
                アイコンからすぐ開けて、画面も広く使えます。追加の方法は機種ごとにヘルプでまとめています。
              </p>
              <a
                href={helpHref("homeScreen")}
                target="_blank"
                rel="noopener"
                className={styles.textLink}
              >
                追加の方法を見る（ヘルプ）
                <span aria-hidden="true"> ↗</span>
                <span className="visually-hidden">（新しいタブで開きます）</span>
              </a>
            </main>
            <footer className={styles.actions}>
              <button type="button" className={styles.primary} onClick={next}>
                次へ
              </button>
            </footer>
          </>
        )}

        {step === "register" && (
          // 完了画面から戻ったときに前の入力が残らないよう、手順ごとに作り直す
          <RegisterStep key={step} headingRef={heading} onLater={leave} leaving={leaving} />
        )}

        {step === "done" && song && <DoneStep song={song} headingRef={heading} />}
      </div>
    </div>
  );
}

function RegisterStep({
  headingRef,
  onLater,
  leaving,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onLater: () => void;
  leaving: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const inputId = useId();
  const errorId = useId();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await registerFirstSongAction(url);
      if (res.status === "ok") router.push(tutorialHref("done", res.id));
      else setError(res.message);
    });
  }

  return (
    <>
      <main className={`${styles.body} ${styles.top}`}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          さっそく1曲、
          <br />
          登録してみましょう
        </h1>
        <p className={styles.lead}>よく歌う曲をひとつ思い浮かべてください。</p>
        <ol className={styles.howto}>
          <li>
            <span className={styles.num} aria-hidden="true">
              01
            </span>
            音楽アプリでその曲を開いて「共有」
          </li>
          <li>
            <span className={styles.num} aria-hidden="true">
              02
            </span>
            「リンクをコピー」を選ぶ
          </li>
          <li>
            <span className={styles.num} aria-hidden="true">
              03
            </span>
            下の欄に貼り付けて「登録する」
          </li>
        </ol>

        {/* type="url" で URL 用のキーボードを出す。共有テキストごと貼られても読めるよう、検証はサーバーに任せる */}
        <form id={formId} onSubmit={submit} noValidate className={styles.form}>
          <label htmlFor={inputId} className={styles.label}>
            曲のリンク
          </label>
          <input
            id={inputId}
            type="url"
            className={styles.input}
            placeholder="https://music.apple.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
          />
          <div id={errorId} aria-live="polite" className={styles.errorArea}>
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <p className={styles.services}>
            {supportedServicesText()} に対応{" "}
            <a href={helpHref("services")} target="_blank" rel="noopener">
              対応サービスについて
            </a>
          </p>
        </form>
      </main>
      <footer className={styles.actions}>
        <button
          type="submit"
          form={formId}
          className={`${styles.primary} ${styles.accent}`}
          disabled={!url.trim() || pending || leaving}
          aria-busy={pending || undefined}
        >
          {pending ? "登録中…" : "登録する"}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={onLater}
          disabled={pending || leaving}
        >
          あとで登録する
        </button>
      </footer>
    </>
  );
}

function DoneStep({
  song,
  headingRef,
}: {
  song: Song;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const editHref = `/songs/${song.id}?edit=1`;
  return (
    <>
      <main className={styles.body}>
        <p className={styles.kicker}>TRACK 01 ADDED</p>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          セトリの1曲目が
          <br />
          できました
        </h1>
        <div className={styles.songCard}>
          <span className={styles.songNum} aria-hidden="true">
            01
          </span>
          <div className={styles.songText}>
            <p className={styles.songTitle}>{song.title}</p>
            <p className={styles.songArtist}>{song.artist}</p>
            <Link href={editHref} className={styles.tagChip} aria-label="この曲にタグを付ける">
              ＋ タグ
            </Link>
          </div>
        </div>
        <aside className={styles.hint} aria-label="ひとことヒント">
          <p className={styles.hintTitle}>ひとことヒント</p>
          <p>「歌える」「練習中」などのタグを付けておくと、カラオケで探しやすくなります。</p>
        </aside>
      </main>
      <footer className={styles.actions}>
        <Link href={editHref} className={styles.primary}>
          タグを付ける
        </Link>
        <Link href="/" className={styles.secondary}>
          曲一覧へ
        </Link>
        <p className={styles.note}>使い方は設定 ›「ヘルプ」から見られます</p>
      </footer>
    </>
  );
}

/** 紙のセトリ（アイコンと同じモチーフ）。装飾 */
function SetlistPaper() {
  return (
    <div className={styles.paper} aria-hidden="true">
      <p className={styles.paperHead}>SET LIST</p>
      {[70, 56, 82, 0].map((w, i) => (
        <div key={i} className={styles.paperRow}>
          <span className={styles.num}>{pad2(i + 1)}</span>
          <span
            className={w ? styles.paperLine : `${styles.paperLine} ${styles.paperBlank}`}
            style={{ width: `${w || 42}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/** ホーム画面のアイコン並び。Setlistic のアイコンだけ強調する。装飾 */
function HomeGrid() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) =>
        i === 4 ? (
          <span key={i} className={`${styles.app} ${styles.appSelf}`}>
            <svg viewBox="0 0 24 24" width="28" height="28">
              <path
                d="M5 7h14M5 12h14M5 17h9"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
        ) : (
          <span key={i} className={styles.app} />
        ),
      )}
    </div>
  );
}
