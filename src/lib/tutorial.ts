// 初回チュートリアル（Issue #18）の手順。画面の状態は URL（/welcome?step=...）に載せ、
// ブラウザバック・Android の戻るで前の手順に戻れるようにする。

export const TUTORIAL_PATH = "/welcome";

export const TUTORIAL_STEPS = ["welcome", "home", "register", "done"] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/**
 * 表示する手順の並び。ホーム画面から起動しているとき（standalone）は
 * 「ホーム画面に追加できます」を飛ばし、番号を詰める（STEP 01 / 03 …）
 */
export function tutorialSteps(standalone: boolean): TutorialStep[] {
  return standalone ? TUTORIAL_STEPS.filter((s) => s !== "home") : [...TUTORIAL_STEPS];
}

/** URL の ?step= を手順にする。知らない値は最初の手順 */
export function parseTutorialStep(raw: string | null | undefined): TutorialStep {
  return TUTORIAL_STEPS.find((s) => s === raw) ?? "welcome";
}

/** 左上の「STEP 01 / 04」。並びに無い手順（飛ばした手順）は、その次の手順の番号で数える */
export function stepPosition(steps: TutorialStep[], step: TutorialStep) {
  const i = steps.indexOf(step);
  const index = i >= 0 ? i : steps.indexOf(nextTutorialStep(steps, step) ?? steps[0]);
  return { current: index + 1, total: steps.length };
}

/** 次の手順（最後なら null） */
export function nextTutorialStep(steps: TutorialStep[], step: TutorialStep): TutorialStep | null {
  const order = TUTORIAL_STEPS.indexOf(step);
  return steps.find((s) => TUTORIAL_STEPS.indexOf(s) > order) ?? null;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** 手順の URL。完了画面は登録した曲の ID を持つ */
export function tutorialHref(step: TutorialStep, songId?: string): string {
  if (step === "welcome") return TUTORIAL_PATH;
  const q = new URLSearchParams({ step });
  if (step === "done" && songId) q.set("song", songId);
  return `${TUTORIAL_PATH}?${q}`;
}
