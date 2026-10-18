import { describe, expect, it } from "vitest";
import { helpHref } from "./help";
import { supportedServicesText } from "./songs/services";
import {
  nextTutorialStep,
  pad2,
  parseTutorialStep,
  stepPosition,
  tutorialHref,
  tutorialSteps,
} from "./tutorial";

describe("tutorialSteps", () => {
  it("ブラウザでは4手順、ホーム画面から起動しているときは「ホーム画面に追加」を飛ばして3手順", () => {
    expect(tutorialSteps(false)).toEqual(["welcome", "home", "register", "done"]);
    expect(tutorialSteps(true)).toEqual(["welcome", "register", "done"]);
  });
});

describe("parseTutorialStep", () => {
  it("知らない値・空は最初の手順", () => {
    expect(parseTutorialStep("register")).toBe("register");
    expect(parseTutorialStep("evil")).toBe("welcome");
    expect(parseTutorialStep(null)).toBe("welcome");
    expect(parseTutorialStep(undefined)).toBe("welcome");
  });
});

describe("stepPosition", () => {
  it("並びの中の番号と総数", () => {
    expect(stepPosition(tutorialSteps(false), "home")).toEqual({ current: 2, total: 4 });
    expect(stepPosition(tutorialSteps(true), "register")).toEqual({ current: 2, total: 3 });
    expect(stepPosition(tutorialSteps(true), "done")).toEqual({ current: 3, total: 3 });
  });

  it("飛ばした手順は、次の手順の番号で数える", () => {
    expect(stepPosition(tutorialSteps(true), "home")).toEqual({ current: 2, total: 3 });
  });
});

describe("nextTutorialStep", () => {
  it("並びに沿って次へ。最後は null", () => {
    expect(nextTutorialStep(tutorialSteps(false), "welcome")).toBe("home");
    expect(nextTutorialStep(tutorialSteps(true), "welcome")).toBe("register");
    expect(nextTutorialStep(tutorialSteps(true), "home")).toBe("register");
    expect(nextTutorialStep(tutorialSteps(false), "done")).toBeNull();
  });
});

describe("tutorialHref", () => {
  it("最初の手順はパスだけ。完了は曲の ID を付ける", () => {
    expect(tutorialHref("welcome")).toBe("/welcome");
    expect(tutorialHref("home")).toBe("/welcome?step=home");
    expect(tutorialHref("done", "s1")).toBe("/welcome?step=done&song=s1");
    expect(tutorialHref("register", "s1")).toBe("/welcome?step=register");
  });
});

describe("そのほか", () => {
  it("番号は2桁、ヘルプの節へのリンク、対応サービスの並び", () => {
    expect(pad2(3)).toBe("03");
    expect(pad2(12)).toBe("12");
    expect(helpHref()).toBe("/help");
    expect(helpHref("homeScreen")).toBe("/help#home-screen");
    expect(supportedServicesText()).toBe("Apple Music・Spotify・YouTube Music");
  });
});
