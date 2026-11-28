// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongRow } from "@/lib/songs/queries";
import { drawSlot, RandomSlot, type SlotDraw, type SlotResult } from "./RandomSlot";

const TODAY = "2026-11-28";
const song = (id: string, title: string, lastSungAt: string | null = null): SongRow => ({
  id,
  title,
  artist: "YOASOBI",
  songKey: null,
  memo: null,
  appleUrl: null,
  sourceService: null,
  sourceUrl: null,
  lastSungAt,
  sungCount: 0,
  tags: [],
  fields: {},
});
const songs = [song("s1", "夜に駆ける"), song("s2", "群青"), song("s3", "アイドル")];

/** 親（SetList）と同じ使い方をする小さな入れ物 */
function Harness(p: { onDecide?: (id: string) => void; rng?: () => number; list?: SongRow[] }) {
  const [draw, setDraw] = useState<SlotResult | null>(null);
  const open = () => setDraw(drawSlot(p.list ?? songs, TODAY, p.rng));
  return (
    <>
      <button type="button" onClick={open}>
        開く
      </button>
      <RandomSlot
        target={draw}
        onDecide={(id) => {
          setDraw(null);
          p.onDecide?.(id);
        }}
        onRetry={open}
        onClose={() => setDraw(null)}
      />
    </>
  );
}

const dialog = () => document.querySelector("dialog")!;
/** 次のタイマーは描画のあとに張られるので、1つずつ進めて演出を最後まで流す */
const finishAll = () => {
  while (vi.getTimerCount() > 0) act(() => vi.runOnlyPendingTimers());
};

// React の scheduler（setImmediate）は数えたくないので、setTimeout だけ差し替える
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("drawSlot", () => {
  it("候補が無ければ null", () => {
    expect(drawSlot([], TODAY)).toBeNull();
  });

  it("今日歌った曲は、当選曲にも流れる曲名にも出さない", () => {
    const list = [
      song("s1", "夜に駆ける", TODAY),
      song("s2", "群青", "2026-11-27"),
      song("s3", "アイドル"),
    ];
    for (const r of [0, 0.4, 0.99]) {
      const d = drawSlot(list, TODAY, () => r) as SlotDraw;
      expect(d.song.id).not.toBe("s1");
      expect(d.seq.map((x) => x.id)).not.toContain("s1");
    }
  });

  it("表示している曲を今日すべて歌っていたら exhausted（曲は選ばない）", () => {
    expect(drawSlot([song("s1", "夜に駆ける", TODAY)], TODAY)).toEqual({ exhausted: true });
  });

  it("当選曲で終わる16個の候補と、15個の間隔を作る", () => {
    const d = drawSlot(songs, TODAY, () => 0.5) as SlotDraw;
    expect(d.song.id).toBe("s2");
    expect(d.seq).toHaveLength(16);
    expect(d.seq.at(-1)).toBe(d.song);
    expect(d.gaps).toHaveLength(15);
  });

  it("動きを減らす設定なら演出なし", () => {
    const mm = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation((q) =>
      q.includes("reduced-motion") ? ({ matches: true } as MediaQueryList) : mm(q),
    );
    const d = drawSlot(songs, TODAY, () => 0) as SlotDraw;
    expect(d.seq).toEqual([d.song]);
    expect(d.gaps).toEqual([]);
  });
});

describe("RandomSlot", () => {
  it("曲名を切り替えて当選曲で止まり、結果を知らせる", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    render(<Harness rng={() => 0.99} />);
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByText("タップでスキップ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "これにする" })).toBeNull();

    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("button", { name: "これにする" })).toBeNull();
    finishAll();
    expect(screen.getByText("今日の1曲")).toBeInTheDocument();
    expect(screen.getByText("「アイドル」（YOASOBI）に決まりました")).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledWith(15);
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("動きを減らす設定なら、すぐに結果を出す", () => {
    const mm = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation((q) =>
      q.includes("reduced-motion") ? ({ matches: true } as MediaQueryList) : mm(q),
    );
    render(<Harness rng={() => 0} />);
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(screen.getByRole("button", { name: "これにする" })).toBeInTheDocument();
    expect(screen.getByText("「夜に駆ける」（YOASOBI）に決まりました")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("演出中のタップ・Esc・Enter でスキップする", () => {
    render(<Harness rng={() => 0.5} />);
    const open = screen.getByRole("button", { name: "開く" });

    fireEvent.click(open);
    fireEvent.click(screen.getByText("タップでスキップ"));
    expect(screen.getByText("「群青」（YOASOBI）に決まりました")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    expect(dialog()).toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "もう一回" }));
    expect(screen.getByText("タップでスキップ")).toBeInTheDocument();
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(screen.getByRole("button", { name: "これにする" })).toBeInTheDocument();
    expect(dialog()).toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "もう一回" }));
    fireEvent.keyDown(dialog(), { key: "Enter" });
    expect(screen.getByRole("button", { name: "これにする" })).toBeInTheDocument();
  });

  it("回すたびにフォーカスをダイアログに置く（1回目と「もう一回」で、見た目もキー操作もそろえる）", () => {
    render(<Harness rng={() => 0.5} />);
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(document.activeElement).toBe(dialog());
    finishAll();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "これにする" }));

    fireEvent.click(screen.getByRole("button", { name: "もう一回" }));
    // 押した「もう一回」は消えるので、そのままだとフォーカスが本文に外れ、Enter でスキップできない
    expect(document.activeElement).toBe(dialog());
  });

  it("今日すべて歌っていたら、そう知らせて曲は選ばない。閉じるで閉じる", () => {
    const onDecide = vi.fn();
    render(<Harness list={[song("s1", "夜に駆ける", TODAY)]} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(dialog()).toHaveAttribute("open");
    expect(dialog()).toHaveTextContent("今日は、いま表示している曲をすべて歌いました");
    expect(screen.queryByText("タップでスキップ")).toBeNull();
    expect(screen.queryByRole("button", { name: "もう一回" })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(dialog()).not.toHaveAttribute("open");
    expect(onDecide).not.toHaveBeenCalled();
  });

  it("「もう一回」で抽選し直す", () => {
    let r = 0;
    render(<Harness rng={() => r} />);
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    finishAll();
    expect(screen.getByText("「夜に駆ける」（YOASOBI）に決まりました")).toBeInTheDocument();
    r = 0.99;
    fireEvent.click(screen.getByRole("button", { name: "もう一回" }));
    expect(screen.queryByRole("button", { name: "これにする" })).toBeNull();
    finishAll();
    expect(screen.getByText("「アイドル」（YOASOBI）に決まりました")).toBeInTheDocument();
  });

  it("「これにする」で当選曲を返して閉じる", () => {
    const onDecide = vi.fn();
    render(<Harness rng={() => 0.5} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    finishAll();
    fireEvent.click(screen.getByRole("button", { name: "これにする" }));
    expect(onDecide).toHaveBeenCalledWith("s2");
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("結果が出たあとは背景のタップ・Esc で閉じる。中身のタップでは閉じない", () => {
    render(<Harness rng={() => 0} />);
    const open = screen.getByRole("button", { name: "開く" });
    fireEvent.click(open);
    finishAll();
    fireEvent.click(screen.getByText("今日の1曲"));
    expect(dialog()).toHaveAttribute("open");
    fireEvent.click(dialog());
    expect(dialog()).not.toHaveAttribute("open");

    fireEvent.click(open);
    finishAll();
    // jsdom は Esc で閉じないので、ブラウザと同じく cancel のあとに閉じる
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog(), cancel);
    expect(cancel.defaultPrevented).toBe(false);
    act(() => dialog().close());
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("演出中に閉じてもタイマーが残らない", () => {
    const { unmount } = render(<Harness rng={() => 0} />);
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    act(() => vi.advanceTimersByTime(200));
    expect(vi.getTimerCount()).toBe(1);
    act(() => dialog().close());
    expect(dialog()).not.toHaveAttribute("open");
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
