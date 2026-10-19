"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** ドロップ先：groupId のグループ（null は「マイタグ」）の index 番目 */
export type TagDrop = { tagId: string; groupId: string | null; index: number };

/** スマホはこの時間押し続けるとドラッグが始まる */
export const LONG_PRESS_MS = 400;
/** 長押しを待つあいだにこれ以上動いたらスクロールとみなしてやめる */
const TOUCH_SLOP = 8;
/** マウスはこれ以上動かしたらドラッグを始める（それまではクリック） */
const MOUSE_SLOP = 4;
/** 画面の上下の端からこの距離に入ったら自動でスクロールする */
const EDGE = 56;
const SCROLL_STEP = 8;

/**
 * y 座標からドロップ先を求める。グループは `data-drop-group`（「マイタグ」は空文字）の要素、
 * タグの行は `data-tag-id` の要素。y を含む（なければいちばん近い）グループの中で、
 * 真ん中が y より上にある行の数を位置にする
 */
export function findDrop(
  container: HTMLElement,
  tagId: string,
  y: number,
): Omit<TagDrop, "tagId"> | null {
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const el of container.querySelectorAll<HTMLElement>("[data-drop-group]")) {
    const r = el.getBoundingClientRect();
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < bestDistance) {
      best = el;
      bestDistance = d;
    }
  }
  if (!best) return null;
  let index = 0;
  for (const row of best.querySelectorAll<HTMLElement>("[data-tag-id]")) {
    if (row.dataset.tagId === tagId) continue;
    const r = row.getBoundingClientRect();
    if (r.top + r.height / 2 < y) index++;
  }
  return { groupId: best.dataset.dropGroup || null, index };
}

/**
 * タグの行をドラッグ（PC）・長押ししてから移動（スマホ）で並べ替える。
 * ドラッグ中は drag にドロップ先が入り、離すと onDrop が呼ばれる。Esc で取り消す
 */
export function useTagDrag(enabled: boolean, onDrop: (drop: TagDrop) => void) {
  const container = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<TagDrop | null>(null);
  const onDropRef = useRef(onDrop);
  // 押している最中（長押し待ちを含む）のあと始末。ドラッグ中かどうかも兼ねる
  const pressing = useRef<{ active: boolean; stop: () => void } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    onDropRef.current = onDrop;
  });

  // ドラッグ中は画面をスクロールさせない。タッチの開始前に登録しておかないと止められない
  useEffect(() => {
    if (!enabled) return;
    const block = (e: TouchEvent) => {
      if (pressing.current?.active) e.preventDefault();
    };
    window.addEventListener("touchmove", block, { passive: false });
    return () => window.removeEventListener("touchmove", block);
  }, [enabled]);

  useEffect(() => () => pressing.current?.stop(), []);

  function onPointerDown(e: ReactPointerEvent, tagId: string, groupId: string | null) {
    if (!enabled || e.button !== 0 || pressing.current) return;
    if ((e.target as Element).closest("[data-no-drag]")) return;
    const pointerId = e.pointerId;
    const touch = e.pointerType === "touch";
    const startX = e.clientX;
    const startY = e.clientY;
    let y = startY;
    let current: TagDrop = { tagId, groupId, index: -1 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const body = document.body.style;
    const saved = { userSelect: body.userSelect, cursor: body.cursor };

    const update = () => {
      const found = container.current && findDrop(container.current, tagId, y);
      if (!found || (found.groupId === current.groupId && found.index === current.index)) return;
      current = { tagId, ...found };
      setDrag(current);
    };
    const autoScroll = () => {
      const dy = y < EDGE ? -SCROLL_STEP : y > window.innerHeight - EDGE ? SCROLL_STEP : 0;
      if (dy) {
        window.scrollBy(0, dy);
        update();
      }
      frame = requestAnimationFrame(autoScroll);
    };
    const begin = () => {
      state.active = true;
      body.userSelect = "none";
      body.cursor = "grabbing";
      window.getSelection()?.removeAllRanges();
      if (touch) navigator.vibrate?.(10);
      update();
      frame = requestAnimationFrame(autoScroll);
    };
    const finish = (drop: boolean) => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      pressing.current = null;
      if (!state.active) return;
      body.userSelect = saved.userSelect;
      body.cursor = saved.cursor;
      // 離したときのクリック（編集が開く）を1回だけ無視する
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      setDrag(null);
      if (drop) onDropRef.current(current);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      y = ev.clientY;
      if (state.active) return update();
      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (touch) {
        if (distance > TOUCH_SLOP) finish(false);
      } else if (distance > MOUSE_SLOP) begin();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(true);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish(false);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(false);
    };

    const state = { active: false, stop: () => finish(false) };
    pressing.current = state;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    if (touch) timer = setTimeout(begin, LONG_PRESS_MS);
  }

  /** タグの行（li）に付ける */
  const rowProps = (tagId: string, groupId: string | null) => ({
    "data-tag-id": tagId,
    onPointerDown: (e: ReactPointerEvent) => onPointerDown(e, tagId, groupId),
    onClickCapture: (e: ReactMouseEvent) => {
      if (!suppressClick.current) return;
      e.preventDefault();
      e.stopPropagation();
    },
    // 長押しで出る端末のメニューを出さない
    onContextMenu: (e: ReactMouseEvent) => {
      if (pressing.current) e.preventDefault();
    },
  });

  return { container, drag, rowProps };
}
