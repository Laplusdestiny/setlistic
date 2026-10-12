"use client";

import { useEffect, useState } from "react";
import { loadSingStateAction } from "@/app/(app)/songs/actions";
import type { CustomField } from "@/lib/custom-fields";
import type { SingState, SongRow } from "@/lib/songs/queries";
import type { GroupOption, TagOption } from "@/lib/tags/types";
import { SongDetail } from "./SongDetail";

type Props = {
  song: SongRow;
  groups: GroupOption[];
  allTags: TagOption[];
  fields: CustomField[];
  today: string;
  onDeleted: () => void;
};

/** PC の右パネル。選んだ曲の歌唱記録だけをここで読み込み、画面遷移はしない */
export function SongPanel(props: Props) {
  // 曲が変わったら key で作り直す（読み込み状態もリセットされる）
  return <Loaded key={props.song.id} {...props} />;
}

function Loaded({ song, groups, allTags, fields, today, onDeleted }: Props) {
  const [sing, setSing] = useState<SingState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSingStateAction(song.id)
      .then((s) => {
        if (!alive) return;
        if (s) setSing(s);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [song.id]);

  if (failed) return <p role="alert">曲の記録を読み込めませんでした。</p>;
  if (!sing) return <div aria-busy="true" style={{ minHeight: 240 }} />;

  return (
    <SongDetail
      song={song}
      groups={groups}
      allTags={allTags}
      fields={fields}
      initialSing={sing}
      today={today}
      onDeleted={onDeleted}
    />
  );
}
