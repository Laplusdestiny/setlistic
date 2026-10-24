import Link from "next/link";
import { formatDateShort } from "@/lib/format";
import {
  buildChart,
  PERIOD_LABELS,
  PERIODS,
  type ChartPoint,
  type SingStats,
  type StatsPeriod,
  type StatsSong,
} from "@/lib/stats/sing-stats";
import styles from "./stats.module.css";

type Props = { period: StatsPeriod; today: string; stats: SingStats };

/** 振り返り：歌唱記録の集計（Issue #1）。期間の切り替えはリンクなので、画面に JS は要らない */
export function StatsScreen({ period, today, stats }: Props) {
  const { summary } = stats;
  const chart = buildChart(stats.monthly, period, today);
  const label = PERIOD_LABELS[period];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="戻る">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1>振り返り</h1>
      </header>

      <nav className={styles.periods} aria-label="期間">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={p === "year" ? "/stats" : `/stats?period=${p}`}
            className={styles.period}
            aria-current={p === period ? "page" : undefined}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </nav>

      <div className={styles.layout}>
        <section className={styles.summary} aria-label={`${label}のまとめ`}>
          <Stat name="歌った回数" value={summary.logs} unit="回" />
          <Stat name="歌った曲" value={summary.songs} unit="曲" />
          <Stat name="カラオケに行った日" value={summary.days} unit="日" />
          <Stat name="初めて歌った曲" value={summary.firstTimes} unit="曲" />
        </section>

        {summary.logs === 0 && (
          <p className={styles.empty}>
            {label}
            の歌唱記録はまだありません。曲の画面の「今日歌った！」で記録すると、ここに集計が出ます。
          </p>
        )}

        {chart && summary.logs > 0 && (
          <section className={`${styles.card} ${styles.wide}`} aria-labelledby="chart-h">
            <div className={styles.cardHead}>
              <h2 id="chart-h">
                {chart.unit === "year" ? "年ごとの歌った回数" : "月ごとの歌った回数"}
              </h2>
            </div>
            <BarChart points={chart.points} />
          </section>
        )}

        {stats.top.length > 0 && (
          <section className={styles.card} aria-labelledby="top-h">
            <div className={styles.cardHead}>
              <h2 id="top-h">よく歌った曲</h2>
              <span>{label}・上位10曲</span>
            </div>
            <SongList songs={stats.top} today={today} countLabel={(n) => `${n}回`} />
          </section>
        )}

        <section className={styles.card} aria-labelledby="dormant-h">
          <div className={styles.cardHead}>
            <h2 id="dormant-h">ご無沙汰の曲</h2>
            <span>3回以上歌って、90日以上歌っていない曲</span>
          </div>
          {stats.dormant.length > 0 ? (
            <SongList songs={stats.dormant} today={today} countLabel={(n) => `これまで${n}回`} />
          ) : (
            <p className={styles.cardEmpty}>いまはありません。</p>
          )}
        </section>

        {(stats.tags.length > 0 || stats.artists.length > 0) && (
          <details className={`${styles.card} ${styles.wide} ${styles.more}`}>
            <summary>タグ別・アーティスト別に詳しく見る</summary>
            <div className={styles.breakdowns}>
              <Breakdown
                title="タグ別"
                note="いま付いているタグで数えています"
                rows={stats.tags.map((t) => ({ ...t, key: t.id }))}
              />
              <Breakdown
                title="アーティスト別"
                rows={stats.artists.map((a) => ({ key: a.artist, name: a.artist, ...a }))}
              />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Stat({ name, value, unit }: { name: string; value: number; unit: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statName}>{name}</span>
      <span className={styles.statValue}>
        {value.toLocaleString("ja-JP")}
        <small>{unit}</small>
      </span>
    </div>
  );
}

function SongList({
  songs,
  today,
  countLabel,
}: {
  songs: StatsSong[];
  today: string;
  countLabel: (n: number) => string;
}) {
  return (
    <ol className={styles.songs}>
      {songs.map((s) => (
        <li key={s.id}>
          <Link href={`/songs/${s.id}`} className={styles.song}>
            <span className={styles.songMain}>
              <span className={styles.songTitle}>{s.title}</span>
              <span className={styles.songArtist}>{s.artist}</span>
            </span>
            <span className={styles.songMeta}>
              <span className={styles.songCount}>{countLabel(s.count)}</span>
              <span>最後 {formatDateShort(s.lastSungAt, today)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * 棒グラフ。棒は SVG（viewBox を 0〜100 にして横に伸ばす）、数と目盛りは HTML の文字で重ねる。
 * SVG の中に文字を置くと、画面幅に合わせて伸び縮みしたときに文字まで潰れるため
 */
function BarChart({ points }: { points: ChartPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const slot = 100 / points.length;
  const showCounts = points.length <= 12;
  const columns = { gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` };

  return (
    <div className={styles.chart}>
      <div className={styles.chartBody} aria-hidden="true">
        {showCounts && (
          <div className={styles.chartCounts} style={columns}>
            {points.map((p) => (
              <span key={p.key}>
                {p.count > 0 && (
                  <span style={{ bottom: `${(p.count / max) * 100}%` }}>{p.count}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <svg className={styles.chartBars} viewBox="0 0 100 100" preserveAspectRatio="none">
          {points.map((p, i) => {
            const h = (p.count / max) * 100;
            return (
              <rect
                key={p.key}
                x={i * slot + slot * 0.18}
                y={100 - h}
                width={slot * 0.64}
                height={h}
              />
            );
          })}
          <line x1="0" y1="100" x2="100" y2="100" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className={styles.chartLabels} style={columns} aria-hidden="true">
        {points.map((p) => (
          <span key={p.key}>
            {p.label}
            {p.year && <small>{p.year}</small>}
          </span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>歌った回数</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.name}</th>
              <td>{p.count}回</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Breakdown({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: { key: string; name: string; count: number; songs: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className={styles.breakdown} aria-label={title}>
      <h3>{title}</h3>
      {note && <p className={styles.note}>{note}</p>}
      {rows.length > 0 ? (
        <ol className={styles.bars}>
          {rows.map((r) => (
            <li key={r.key}>
              <span className={styles.barName}>{r.name}</span>
              <span className={styles.barValue}>
                {r.count}回<small>（{r.songs}曲）</small>
              </span>
              <span className={styles.barTrack} aria-hidden="true">
                <span style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.cardEmpty}>ありません。</p>
      )}
    </section>
  );
}
