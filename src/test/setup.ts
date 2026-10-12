import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// 画面のテスト（// @vitest-environment jsdom）だけの準備
if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
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
