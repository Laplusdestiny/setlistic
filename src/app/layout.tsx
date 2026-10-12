import type { Metadata, Viewport } from "next";
import { Klee_One, Zen_Kaku_Gothic_New } from "next/font/google";
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

export const metadata: Metadata = {
  title: { default: "Setlistic", template: "%s | Setlistic" },
  description: "カラオケで歌える曲を登録・タグ付けして、店でその場で探せるセトリ管理アプリ",
  applicationName: "Setlistic",
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
