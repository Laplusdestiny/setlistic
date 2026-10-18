import type { Metadata, Viewport } from "next";
import { Klee_One, Zen_Kaku_Gothic_New } from "next/font/google";
import { SITE_ORIGIN } from "@/lib/site";
import "./globals.css";

const zenKaku = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-zen-kaku",
});

const klee = Klee_One({
  weight: "600",
  display: "swap",
  variable: "--font-klee",
});

const DESCRIPTION = "カラオケで歌える曲を登録・タグ付けして、店でその場で探せるセトリ管理アプリ";

// OGP画像などを絶対URLにするための基準。Vercel 上（本番・プレビュー）では常に独自ドメインを正とする
const SITE_URL = process.env.VERCEL ? SITE_ORIGIN : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Setlistic", template: "%s | Setlistic" },
  description: DESCRIPTION,
  applicationName: "Setlistic",
  // 共有時のカード。各ページは title だけ上書きするので、カードの見出しは常に「Setlistic」になる。
  // 画像は src/app/opengraph-image.png（scripts/generate-og-image.tsx で作る）
  openGraph: {
    type: "website",
    siteName: "Setlistic",
    title: "Setlistic",
    description: DESCRIPTION,
    locale: "ja_JP",
    // サイトの入口（トップ）を正規のURLとする。metadataBase で本番ドメインの絶対URLになる
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Setlistic", description: DESCRIPTION },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }],
    apple: "/icon-180.png",
  },
  appleWebApp: { capable: true, title: "Setlistic", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f2ea",
  width: "device-width",
  initialScale: 1,
  // iPhone のセーフエリア（ホームバー）の余白（env(safe-area-inset-bottom)）を効かせるために必要
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${zenKaku.variable} ${klee.variable}`}>
      <body>{children}</body>
    </html>
  );
}
