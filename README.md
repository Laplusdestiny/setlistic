# Setlistic 実装引き継ぎパッケージ

カラオケで歌える曲を登録・タグ付けし、店でその場で探せるWebアプリ「Setlistic」の、要件・デザイン・実装計画一式です。Claude Code に渡して実装を始めるためのものです。

## 使い方

1. 新しいリポジトリ（例：`setlistic`）を作り、このパッケージの中身をルートに置く
2. Claude Code をリポジトリで起動し、最初に次のように依頼する

   > CLAUDE.md と docs/ を読んで、docs/implementation-plan.md の Phase 0 から進めてください。着手前に docs/open-questions.md の「実装前に決めること」を私に確認してください。

3. `design/` はデザインの参照元。実装時にアプリ側（`public/` など）へコピーして使う

## 中身

| パス | 内容 |
| --- | --- |
| `CLAUDE.md` | Claude Code 向けの前提・決定事項・実装ルール（最初に読まれる） |
| `docs/requirements.md` | 要件定義書（Claude Docs版の書き出し） |
| `docs/implementation-plan.md` | フェーズ別の実装計画と受け入れ条件 |
| `docs/screens.md` | 画面一覧、モックアップとの対応、画面ごとの仕様 |
| `docs/design-system.md` | 色・フォント・角丸・コンポーネントの規則（モックから抽出） |
| `docs/schema-draft.sql` | DBスキーマとRLSの叩き台（Drizzle定義へ移す前提） |
| `docs/open-questions.md` | 未決事項と、要件とモックの食い違い |
| `design/icon/` | アプリアイコン（SVG原本、PNG各サイズ、maskable、favicon.ico） |
| `design/mockups/` | UIモックアップのHTMLソース（スマホ8画面、PC4画面） |

## 元資料（claude.ai）

- 要件定義書：https://claude.ai/artifact/UPHXn3ymFjrWDYFopme4hi
- UIモックアップ：https://claude.ai/artifact/B9dbK8TbJFKTXQAPZwFnKp
- アイコン案（採用は「Setlistic A：セトリ表」）：https://claude.ai/artifact/CAvW8BV97UD2CUVUzWdv3b

パッケージ作成日：2026-10-11（同日更新：認証方式の決定を反映）
