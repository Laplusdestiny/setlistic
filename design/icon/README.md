# アプリアイコン（採用案：セトリ表）

紺の背景に、テープで留めたセットリストの紙を少し傾けて置いたデザイン。1曲目だけピンクでハイライトし、再生マークを付けている。図形のみで文字は含まない。

| ファイル | 用途 |
| --- | --- |
| `icon.svg` | 原本。全面背景・角丸なし（OSが角を丸める用途向け） |
| `icon-rounded.svg` | 角丸付き（rx=224/1024）。README、OGP、ストア外の紹介用 |
| `icon-maskable.svg` | PWA maskable用。中身を82%に縮めてセーフゾーン内に収めたもの |
| `png/icon-{1024,512,192,48,32,16}.png` | `icon.svg` の書き出し |
| `png/icon-180.png` | `apple-touch-icon` |
| `png/icon-maskable-{512,192}.png` | manifest の `"purpose": "maskable"` |
| `png/icon-rounded-512.png` | 角丸版の書き出し |
| `favicon.ico` | 16/32/48px入り |

テーマカラー（manifest の `theme_color` 候補）：`#1F2A44`。背景色（`background_color`）候補：`#F5F2EA`。
