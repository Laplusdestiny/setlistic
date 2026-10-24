import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// 画面のテスト（// @vitest-environment jsdom）だけの準備
if (typeof window !== "undefined") {
  const { cleanup, configure } = await import("@testing-library/react");
  // findBy* / waitFor の待ち時間（既定1秒）を延ばす。全件を並列で流して負荷が高いと、
  // useTransition の中の更新が1秒に間に合わずまれに落ちるため（#40）
  configure({ asyncUtilTimeout: 3000 });
  const { installMatchMedia, setViewportWidth } = await import("./media");
  installMatchMedia();
  afterEach(() => {
    cleanup();
    setViewportWidth(375);
  });

  // jsdom は <dialog> の showModal / close を持たないので、open 属性の付け外しだけ再現する
  const proto = HTMLDialogElement.prototype;
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
