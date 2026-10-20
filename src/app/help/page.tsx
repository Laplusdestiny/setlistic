import type { Metadata } from "next";
import Link from "next/link";
import { HELP_SECTIONS, helpHref, type HelpSection } from "@/lib/help";
import { SUPPORTED_SERVICE_NAMES } from "@/lib/songs/services";
import { TUTORIAL_PATH } from "@/lib/tutorial";
import styles from "./help.module.css";

export const metadata: Metadata = { title: "ヘルプ" };

// 使い方とよくある困りごと（Issue #18）。ログインできないときの案内もあるので、ログイン前から読める。
// 方針：「困りごと → 一行回答 → 該当する節へのリンク」で、困っている人を使い方の説明につなげる。

const TOC: { id: HelpSection; label: string }[] = [
  { id: "trouble", label: "よくある困りごと" },
  { id: "register", label: "曲を登録する" },
  { id: "edit", label: "曲を編集・削除する" },
  { id: "tags", label: "タグを使う" },
  { id: "search", label: "曲を探す" },
  { id: "homeScreen", label: "ホーム画面に追加する" },
  { id: "pc", label: "PCで使う" },
  { id: "data", label: "データの書き出し・取り込み" },
  { id: "account", label: "アカウント" },
  { id: "contact", label: "お問い合わせ" },
];

const TROUBLES: { q: string; a: string; to: HelpSection }[] = [
  {
    q: "共有URLを貼っても読み込めない",
    a: "曲のURLか、対応しているサービスかを確かめてください。アルバムやプレイリストのURLは読めません。",
    to: "services",
  },
  {
    q: "登録した曲が見つからない",
    a: "絞り込みが残っていないか確かめて、検索欄に曲名やアーティスト名を入れてください。",
    to: "search",
  },
  {
    q: "タグが増えすぎた／名前を変えたい",
    a: "タグの管理画面で、名前の変更・統合・削除ができます。",
    to: "tags",
  },
  {
    q: "曲名やアーティストが間違っている",
    a: "曲を開いて「編集」から直せます。",
    to: "edit",
  },
  {
    q: "ホーム画面に追加できない",
    a: "iPhone は Safari で開いているか確かめてください。",
    to: "homeScreen",
  },
  {
    q: "PCでも使いたい",
    a: "同じGoogleアカウントでログインすれば、同じセトリが使えます。",
    to: "pc",
  },
  {
    q: "何を歌うか決められない",
    a: "セトリの「ランダム」で、表示中の曲から1曲選べます。",
    to: "random",
  },
  {
    q: "ジャケット画像が表示されない",
    a: "いまは、ジャケット画像を表示しない作りにしています。",
    to: "register",
  },
  {
    q: "ログインできない",
    a: "招待されたGoogleアカウントでログインしているか確かめてください。",
    to: "account",
  },
];

const id = (s: HelpSection) => HELP_SECTIONS[s];

export default function HelpPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>HELP</p>
        <h1>使い方・ヘルプ</h1>
        <p className={styles.lead}>
          はじめての方は、<Link href={TUTORIAL_PATH}>チュートリアル</Link>
          で1曲登録するところまで案内します（ログインが必要です）。
        </p>
      </header>

      <nav className={styles.toc} aria-label="ヘルプの目次">
        <ul>
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${id(t.id)}`}>{t.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <article className={styles.article}>
        <section id={id("trouble")} aria-labelledby="h-trouble">
          <h2 id="h-trouble">よくある困りごと</h2>
          <dl className={styles.trouble}>
            {TROUBLES.map((t) => (
              <div key={t.q}>
                <dt>{t.q}</dt>
                <dd>
                  {t.a} <a href={helpHref(t.to)}>くわしく</a>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id={id("register")} aria-labelledby="h-register">
          <h2 id="h-register">曲を登録する</h2>
          <p>
            スマホは下のタブバー中央の「＋」、PCは左のメニューの「＋
            曲を登録」から登録画面を開きます。
          </p>
          <h3>共有リンクから登録する</h3>
          <ol>
            <li>音楽アプリで、登録したい曲を開いて「共有」を押す</li>
            <li>「リンクをコピー」を選ぶ</li>
            <li>Setlistic の登録画面の欄に貼り付けて、曲の情報を読み込む</li>
            <li>曲名・アーティストを確かめ、タグやキーを付けて保存する</li>
          </ol>
          <p>
            「共有」で出てくる文章をそのまま貼り付けても、中のURLを読み取ります。曲名などの情報は、登録するときに一度だけ取得して保存します。
          </p>
          <h3 id={id("services")}>対応しているサービス</h3>
          <ul>
            {SUPPORTED_SERVICE_NAMES.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>
            Spotify・YouTube Music
            のリンクは、曲名とアーティストを読み取ってから、表記をそろえるために同じ曲を探します。候補がはっきりしないときは、登録画面で候補から選べます。Amazon
            Music は、いまは対応していません。
          </p>
          <h3>うまく読み込めないとき</h3>
          <ul>
            <li>
              アルバム・プレイリスト・アーティストのページのURLは読めません。曲を開いてから「共有」してください
            </li>
            <li>
              リンクのない曲や読み込めない曲は、登録画面の「曲名で探す」か「手入力」で登録できます
            </li>
            <li>通信に失敗したときは、少し時間をおいてもう一度お試しください</li>
          </ul>
          <h3>まとめて登録する</h3>
          <p>
            登録画面の「まとめて登録」では、複数の曲のURLを1行に1つずつ貼り付けて、一度に登録できます（1回20曲まで）。
          </p>
          <h3>そのほか</h3>
          <ul>
            <li>同じ曲を二度登録しようとすると、登録済みであることをお知らせします</li>
            <li>登録できる曲は、1人2,000曲までです</li>
            <li>
              ジャケット画像は、いまは表示していません。曲のリンク元（Apple Music
              など）は、曲の画面からリンクで開けます
            </li>
          </ul>
        </section>

        <section id={id("edit")} aria-labelledby="h-edit">
          <h2 id="h-edit">曲を編集・削除する</h2>
          <p>
            セトリで曲を選ぶと、曲の画面が開きます（PCでは右側に表示されます）。「編集」から、曲名・アーティスト・キー・タグ・メモなどを直せます。
          </p>
          <ul>
            <li>
              <strong>キー</strong>：−／＋で、原曲から −7〜+7 の範囲で記録できます
            </li>
            <li>
              <strong>今日歌った！を記録</strong>
              ：歌った日と歌いやすさ（1 余裕〜5
              辛かった）、ひとことメモを残せます。歌った回数・最後に歌った日に反映されます
            </li>
            <li>
              <strong>カスタム項目</strong>
              ：最高点・機種など、自分で項目を足せます（設定 › カスタム項目）
            </li>
            <li>
              <strong>削除</strong>
              ：曲の画面のいちばん下の「この曲を削除」から。確認のあと、その曲の歌唱記録やタグの紐づけも消えます。元に戻せません
            </li>
          </ul>
        </section>

        <section id={id("tags")} aria-labelledby="h-tags">
          <h2 id="h-tags">タグを使う</h2>
          <p>タグは、曲を探すための目印です。最初から次のグループとタグを用意しています。</p>
          <ul>
            <li>
              <strong>歌える度</strong>：十八番・歌える・練習中・歌いたい
            </li>
            <li>
              <strong>ジャンル</strong>・<strong>シーン</strong>・<strong>マイタグ</strong>
              ：自由にタグを足せます
            </li>
          </ul>
          <h3>付け方</h3>
          <p>
            登録するとき、または曲の「編集」で、タグを選んだり新しく作ったりできます。入力すると、これまでに作ったタグが候補に出ます。毎回付けたいタグは、設定の「登録時に付けるタグ」で選んでおけます。
          </p>
          <h3>タグの管理画面</h3>
          <p>
            <Link href="/tags">タグ管理</Link>
            の「管理」で、タグを選ぶと次のことができます。
          </p>
          <ul>
            <li>
              名前の変更、並べ替え（ドラッグ・スマホは長押ししてから移動。↑↓ボタンでも）、削除
            </li>
            <li>別のタグに統合（似たタグを1つにまとめる）</li>
            <li>別名の登録（「アニソン」と「アニメ」のように、別の呼び方でも検索で見つかる）</li>
            <li>グループの追加と、グループへのタグの追加</li>
          </ul>
          <p>
            複数の曲にまとめてタグを付けたり外したりするときは、
            <Link href="/bulk">タグ・優先度の一括変更</Link>
            を使います。タグ名の全角・半角や大文字・小文字の違いは同じタグとして扱いますが、ひらがなとカタカナの違いは別のタグになります。
          </p>
        </section>

        <section id={id("search")} aria-labelledby="h-search">
          <h2 id="h-search">曲を探す</h2>
          <h3>検索・絞り込み</h3>
          <ul>
            <li>
              セトリ上部の検索欄で、曲名・アーティスト・メモ・タグから探せます（PCでは
              <kbd>/</kbd> キーで検索欄に移れます）
            </li>
            <li>検索欄の下のタグを選ぶと、そのタグの曲だけを表示します</li>
            <li>
              検索の画面では、タグをタップするたびに「含める → 除外 →
              解除」と切り替わります。タグの組み合わせは「すべて含む」「どれか」から選べます
            </li>
            <li>「詳しい条件」で、アーティスト・年代・曲の長さ・キーなどでも絞り込めます</li>
            <li>よく使う条件は「この条件に名前を付けて保存」で、あとから呼び出せます</li>
          </ul>
          <p>
            曲が見つからないときは、絞り込みが残っていないか（「すべて」を選ぶ・リセットする）を確かめてください。
          </p>
          <h3 id={id("random")}>ランダム（今日の1曲）</h3>
          <p>
            何を歌うか迷ったら、セトリの「ランダム」を押してください。いま表示している曲の中から1曲を選び、曲名が切り替わって止まる演出のあと「今日の1曲」を表示します。演出はタップで飛ばせます。タグで絞り込んでから押すと、その中から選びます。
          </p>
        </section>

        <section id={id("homeScreen")} aria-labelledby="h-home">
          <h2 id="h-home">ホーム画面に追加する</h2>
          <p>ホーム画面に追加すると、アイコンからすぐ開けて、アプリのように画面を広く使えます。</p>
          <h3>iPhone（Safari）</h3>
          <ol>
            <li>Safari で Setlistic を開く</li>
            <li>
              画面下の「…」（その他の操作）→「共有」を押す（以前の iOS では、共有ボタン
              <span aria-hidden="true">（□に↑）</span>を押す）
            </li>
            <li>一覧を下にたどり、「その他」→「ホーム画面に追加」を選ぶ</li>
            <li>右上の「追加」を押す</li>
          </ol>
          <p>
            うまくいかないときは、LINE などのアプリ内のブラウザではなく、Safari
            で開いているかを確かめてください。
          </p>
          <h3>Android（Chrome）</h3>
          <ol>
            <li>Chrome で Setlistic を開く</li>
            <li>右上の「︙」（メニュー）を押す</li>
            <li>「アプリをインストール」または「ホーム画面に追加」を選ぶ</li>
            <li>確認が出たら「インストール」（または「追加」）を押す</li>
          </ol>
        </section>

        <section id={id("pc")} aria-labelledby="h-pc">
          <h2 id="h-pc">PCで使う</h2>
          <p>
            PCでは、左から「メニュー」「絞り込み」「曲の一覧」「選んだ曲の詳細」が並ぶ画面になります。曲を選ぶと、画面を移らずに右側で確認・編集できます。曲をまとめて登録したり、タグを整理したりするのはPCが便利です。
          </p>
          <p>
            スマホと同じGoogleアカウントでログインすれば、同じセトリが表示されます（データはアカウントに保存されます）。
          </p>
        </section>

        <section id={id("data")} aria-labelledby="h-data">
          <h2 id="h-data">データの書き出し・取り込み</h2>
          <p>設定の「データ」から、登録した曲を書き出せます。</p>
          <ul>
            <li>
              <strong>JSON</strong>
              ：控え（バックアップ）用。別のアカウントへの取り込みにも使えます
            </li>
            <li>
              <strong>CSV</strong>：表計算アプリで見るとき用
            </li>
          </ul>
          <p>
            JSON の取り込みは「追加」だけです。今あるデータは消えず、同じ曲（Apple Music
            の曲IDが同じもの）は取り込みません。
          </p>
        </section>

        <section id={id("account")} aria-labelledby="h-account">
          <h2 id="h-account">アカウント</h2>
          <h3>ログイン</h3>
          <p>
            Setlistic は招待制で、ログインは Google アカウントだけです。招待されたメールアドレスの
            Google アカウントでログインしてください。
          </p>
          <h3>ログインできないとき</h3>
          <ul>
            <li>
              「このGoogleアカウントでは利用できません」と出るときは、招待されたものとは別の Google
              アカウントでログインしようとしています。アカウントを切り替えるか、招待してくれた人に、使いたいアカウントのメールアドレスを伝えてください
            </li>
            <li>
              LINE などのアプリ内のブラウザでは、Google のログインができないことがあります。Safari
              や Chrome で開き直してください
            </li>
          </ul>
          <h3>退会・データの削除</h3>
          <p>
            設定の「アカウントの削除」から退会できます。登録した曲・タグ・歌唱記録など、すべてのデータが削除され、元に戻せません。残しておきたいときは、先に
            <a href={helpHref("data")}>JSON で書き出し</a>てください。
          </p>
        </section>

        <section id={id("contact")} aria-labelledby="h-contact">
          <h2 id="h-contact">お問い合わせ</h2>
          <p>不具合や要望は、招待時にお伝えした連絡先までお寄せください。</p>
        </section>
      </article>

      <p className={styles.back}>
        <Link href="/">Setlistic に戻る</Link>
      </p>
      <p className={styles.legal}>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシーポリシー</Link>
      </p>
    </div>
  );
}
