// OGP画像（src/app/opengraph-image.png）を作り直すスクリプト。
// 画像は静的ファイルとしてコミットし、実行時には生成しない（ビルドでも外部フォントを取りに行かない）。
//   npx tsx scripts/generate-og-image.tsx
// フォントは Google Fonts から、画像で使う文字だけのサブセットを取得する。
import { readFile, writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

const OUT = "src/app/opengraph-image.png";
const TITLE = "Setlistic";
const LABEL = "SET LIST";
const TAGLINE = "歌える曲を、自分だけのセトリに。";
const DESCRIPTION = "カラオケの持ち歌を登録して、お店でその場で探せる";

// docs/design-system.md の色
const BG = "#f5f2ea";
const PAPER = "#fffdf8";
const INK = "#1e1c18";
const MUTED = "#5e5a52";
const PRIMARY = "#2747a0";
const BORDER = "#d9d2c3";

async function googleFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  // User-Agent を付けないと TrueType の URL が返る（satori は woff2 を読めない）
  const css = await (await fetch(url)).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!src) throw new Error(`フォントを取得できませんでした: ${family}`);
  return (await fetch(src)).arrayBuffer();
}

async function main() {
  const icon = await readFile("design/icon/icon-rounded.svg", "utf8");
  const iconSrc = `data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`;

  const image = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        fontFamily: "Zen Kaku Gothic New",
      }}
    >
      <div
        style={{
          width: 1100,
          height: 500,
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 64px",
          background: PAPER,
          border: `2px solid ${BORDER}`,
          borderRadius: 32,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={iconSrc} width={230} height={230} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontFamily: "Klee One", fontSize: 34, color: PRIMARY }}>{LABEL}</div>
          <div style={{ fontSize: 104, fontWeight: 700, color: INK, lineHeight: 1 }}>{TITLE}</div>
          <div style={{ marginTop: 18, fontSize: 38, fontWeight: 700, color: INK }}>{TAGLINE}</div>
          <div style={{ fontSize: 25, fontWeight: 500, color: MUTED }}>{DESCRIPTION}</div>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Zen Kaku Gothic New",
          weight: 700,
          data: await googleFont("Zen Kaku Gothic New", 700, TITLE + TAGLINE),
        },
        {
          name: "Zen Kaku Gothic New",
          weight: 500,
          data: await googleFont("Zen Kaku Gothic New", 500, DESCRIPTION),
        },
        { name: "Klee One", weight: 600, data: await googleFont("Klee One", 600, LABEL) },
      ],
    },
  );

  await writeFile(OUT, Buffer.from(await image.arrayBuffer()));
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
