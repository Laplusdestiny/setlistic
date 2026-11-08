import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Setlistic",
    short_name: "Setlistic",
    description: "カラオケで歌える曲を登録・タグ付けして、店でその場で探せるセトリ管理アプリ",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f2ea",
    theme_color: "#f5f2ea",
    // Android（Chrome）の共有メニューに出す。URL は `text` に入って渡されることもある
    share_target: {
      action: "/add",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
