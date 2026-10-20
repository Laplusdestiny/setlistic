import { PRIORITY_LABELS, parsePriority } from "../songs/priority";

/** エクスポート JSON（DB関数 export_data の出力）の、CSVに使う部分だけの型 */
export type ExportedSong = {
  apple_track_id?: number | null;
  title: string;
  artist: string;
  album?: string | null;
  genre?: string | null;
  release_date?: string | null;
  song_key?: number | null;
  practice_priority?: number | null;
  memo?: string | null;
  created_at?: string | null;
  apple_url?: string | null;
  tags?: string[];
  fields?: Record<string, unknown>;
  sing_logs?: { sung_at: string; ease?: number | null; note?: string | null }[];
};

export type ExportedData = {
  custom_fields?: { name: string; sort_order?: number; hidden?: boolean }[];
  songs?: ExportedSong[];
};

/**
 * CSV の1セル。RFC 4180 のクォート処理に加えて、Excel/スプレッドシートで数式として
 * 解釈される先頭文字（= + - @ とタブ・改行）の前に ' を付けて無害化する（CSV インジェクション対策）。
 * 数値列は guard=false で呼ぶ（負のキー「-2」を壊さないため）。
 */
export function csvCell(value: unknown, guard = true): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (guard && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const asText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(" / ");
  if (typeof v === "boolean") return v ? "はい" : "";
  return String(v);
};

/** 曲一覧を CSV にする。先頭に BOM（Excel の文字化け対策）、改行は CRLF */
export function exportToCsv(data: ExportedData): string {
  const fields = [...(data.custom_fields ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const header = [
    "曲名",
    "アーティスト",
    "アルバム",
    "ジャンル",
    "リリース日",
    "キー",
    "練習の優先度",
    "タグ",
    "メモ",
    "最後に歌った日",
    "歌った回数",
    "登録日",
    "Apple Music URL",
    ...fields.map((f) => f.name),
  ];

  const rows = (data.songs ?? []).map((s) => {
    const logs = s.sing_logs ?? [];
    const last = logs.reduce<string>((m, l) => (l.sung_at > m ? l.sung_at : m), "");
    const priority = parsePriority(s.practice_priority);
    return [
      csvCell(s.title),
      csvCell(s.artist),
      csvCell(s.album),
      csvCell(s.genre),
      csvCell(s.release_date, false),
      csvCell(s.song_key, false),
      csvCell(priority !== null ? PRIORITY_LABELS[priority] : "", false),
      csvCell((s.tags ?? []).join(" / ")),
      csvCell(s.memo),
      csvCell(last, false),
      csvCell(logs.length, false),
      csvCell(s.created_at ? s.created_at.slice(0, 10) : "", false),
      csvCell(s.apple_url),
      ...fields.map((f) => {
        const v = s.fields?.[f.name];
        return typeof v === "number" ? csvCell(v, false) : csvCell(asText(v));
      }),
    ].join(",");
  });

  return `﻿${[header.map((h) => csvCell(h)).join(","), ...rows].join("\r\n")}\r\n`;
}
