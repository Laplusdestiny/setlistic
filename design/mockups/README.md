# UIモックアップ

claude.ai のデザインキャンバス（https://claude.ai/artifact/B9dbK8TbJFKTXQAPZwFnKp ）のソース。ブラウザで直接開いても描画されない（専用ランタイム `support.js` 前提）ので、実装の参照資料として読む。見た目を確認したいときは上のURLを開く。

## 読み方

- `<x-dc>` 〜 `</x-dc>`：画面のマークアップ。スタイルはすべてインライン
- `{{name}}`：末尾スクリプトの `renderVals()` が返す値の差し込み
- `<sc-for list="{{items}}" as="x">`：配列の繰り返し
- `<sc-if>` があれば条件表示
- 末尾 `<script type="text/x-dc">`：サンプルデータと状態（チップ選択、タグのトグル、キー増減など）
- 画面間の `href="Detail.dc.html"` などは遷移先の画面を示す

## 対応表

| ファイル | 画面 | サイズ |
| --- | --- | --- |
| `sp/Login.dc.html` | 01 ログイン | 390×844 |
| `sp/Main.dc.html` | 02 ホーム（曲一覧） | 390×844 |
| `sp/Search.dc.html` | 03 検索・タグ絞り込み | 390×844 |
| `sp/AddUrl.dc.html` | 04 曲登録（URL貼り付け） | 390×844 |
| `sp/AddConfirm.dc.html` | 05 登録確認・タグ付け | 390×844 |
| `sp/Detail.dc.html` | 06 曲詳細・編集 | 390×844 |
| `sp/Settings.dc.html` | 07 設定 | 390×844 |
| `sp/Tags.dc.html` | 08 タグ管理・タグから探す | 390×844 |
| `pc/Home.dc.html` | PC-01 ホーム＋絞り込み（3ペイン） | 1440×900 |
| `pc/Add.dc.html` | PC-02 曲登録 | 1440×900 |
| `pc/Tags.dc.html` | PC-03 タグ管理 | 1440×900 |
| `pc/Settings.dc.html` | PC-04 設定 | 1440×900 |

モック内の曲名・アーティストはサンプル。`[メールアドレス]` `[点数]` などの角括弧はプレースホルダー。
