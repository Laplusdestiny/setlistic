import { youtubeMusicUrl } from "./apple-url";
import type { SourceSong } from "./match";
import { SourceError, fetchJson, fetchText } from "./source-fetch";

/**
 * YouTube Music の曲情報。YouTube Music の内部 API → Data API v3 → watch ページの HTML → oEmbed の順に試し、
 * 取れた時点で終わる。
 * YouTube Music の内部 API は日本語の表記（米津玄師・林明日香）を返すので、最初に試す（Issue #47）。
 * それ以外は日本語を指定しても「Kenshi Yonezu」のようなローマ字表記になり、iTunes Search の表記と合わない。
 * 自動生成（Topic）動画の説明文に曲名・アーティスト・アルバム・リリース日が入っているので、それを優先して読む。
 */

type Parsed = Omit<SourceSong, "service" | "method" | "id" | "url">;

const TOPIC_SUFFIX = " - Topic";
const VARIOUS = "Various Artists";
// 「(Official Music Video)」「【MV】」など、曲名ではない飾りの括弧
const MV_NOISE =
  /\s*[([【（［][^)\]】）］]*(?:official|music\s*video|mv|lyric|audio|video|公式|ミュージックビデオ)[^)\]】）］]*[)\]】）］]\s*/gi;
// 「米津玄師 MV「ピースサイン」」「YOASOBI「夜に駆ける」Official Music Video」の形
const QUOTED = /^(.+?)\s*(?:MV|PV)?\s*[「『](.+?)[」』]/i;

/**
 * 自動生成動画の説明文を読む。形式（空行区切り）:
 *   Provided to YouTube by <レーベル>
 *   <曲名> · <メインアーティスト> · <その他の名前...>
 *   <アルバム>
 *   ℗ ...
 *   Released on: YYYY-MM-DD
 * 3番目以降の名前には作詞・作曲のクレジットが混ざるので、アーティストとして扱わず credits に入れる。
 */
export function parseProvidedDescription(desc: string | null | undefined): Parsed | null {
  if (!desc || !desc.startsWith("Provided to YouTube by")) return null;
  const blocks = desc
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length < 2) return null;

  const [title, artist, ...rest] = blocks[1].split(" · ").map((s) => s.trim());
  if (!title) return null;
  const release = desc.match(/Released on:\s*(\d{4}-\d{2}-\d{2})/);
  const album = blocks[2] && !blocks[2].startsWith("℗") ? blocks[2] : null;

  return {
    title,
    artist: artist || null,
    credits: [...new Set(rest.filter((n) => n && n !== artist))],
    album,
    releaseDate: release ? release[1] : null,
    durationSec: null,
  };
}

/** 説明文が自動生成の形式でないとき、動画タイトルとチャンネル名から推定する */
export function fromTitleAndChannel(title: string, channel: string): Parsed {
  const base = { credits: [], album: null, releaseDate: null, durationSec: null };
  if (channel.endsWith(TOPIC_SUFFIX)) {
    const name = channel.slice(0, -TOPIC_SUFFIX.length).trim();
    return { ...base, title: title.trim(), artist: name && name !== VARIOUS ? name : null };
  }
  // MV など：飾りを除いて「アーティスト - 曲名」の分割を試す
  const cleaned = title.replace(MV_NOISE, " ").replace(/\s+/g, " ").trim();
  const strip = (s: string) =>
    s
      .trim()
      .replace(/^[「『"']+|[」』"']+$/g, "")
      .trim();
  const quoted = cleaned.match(QUOTED);
  if (quoted) return { ...base, title: strip(quoted[2]), artist: strip(quoted[1]) };
  for (const sep of [" - ", " – ", " / ", "／"]) {
    const i = cleaned.indexOf(sep);
    if (i > 0) {
      return {
        ...base,
        title: strip(cleaned.slice(i + sep.length)),
        artist: strip(cleaned.slice(0, i)),
      };
    }
  }
  return { ...base, title: strip(cleaned) || title.trim(), artist: channel.trim() || null };
}

function describe(title: string, channel: string, description: string | null): Parsed {
  return parseProvidedDescription(description) ?? fromTitleAndChannel(title, channel);
}

/** ISO 8601 の長さ（例: PT4M33S）を秒にする */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  const m = iso?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m || iso === "P" || iso === "PT") return null;
  const [d, h, min, s] = m.slice(1).map((v) => Number(v ?? 0));
  return ((d * 24 + h) * 60 + min) * 60 + s;
}

/**
 * `ytInitialPlayerResponse = {...};` の JSON 部分だけを取り出す。
 * JS には Python の raw_decode にあたるものがないので、文字列リテラルの中を飛ばしながら括弧の対応を追う。
 */
export function extractPlayerResponse(html: string): unknown {
  const m = /ytInitialPlayerResponse\s*=\s*\{/.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;

export function parseWatchHtml(html: string): Parsed | null {
  const details = obj(obj(extractPlayerResponse(html))?.videoDetails);
  const title = str(details?.title);
  if (!details || !title) return null;
  const parsed = describe(title, str(details.author) ?? "", str(details.shortDescription));
  const length = str(details.lengthSeconds);
  return { ...parsed, durationSec: length && /^\d+$/.test(length) ? Number(length) : null };
}

/** Data API v3 の videos.list（part=snippet,contentDetails）の応答を読む */
export function parseDataApi(body: unknown): Parsed | null {
  const item = obj((obj(body)?.items as unknown[] | undefined)?.[0]);
  const snippet = obj(item?.snippet);
  const title = str(snippet?.title);
  if (!snippet || !title) return null;
  const parsed = describe(title, str(snippet.channelTitle) ?? "", str(snippet.description));
  return { ...parsed, durationSec: parseIsoDuration(str(obj(item?.contentDetails)?.duration)) };
}

// YouTube Music の Web クライアントを名乗る。clientVersion は形式が正しくないと 404 になる
const MUSIC_NEXT_URL = "https://music.youtube.com/youtubei/v1/next?prettyPrint=false";
const MUSIC_CLIENT = {
  clientName: "WEB_REMIX",
  clientVersion: "1.20241023.01.00",
  hl: "ja",
  gl: "JP",
};

/** 「5:34」「1:02:03」を秒にする */
export function parseClock(s: string | null | undefined): number | null {
  if (!s || !/^\d+(?::\d{1,2}){1,2}$/.test(s.trim())) return null;
  return s
    .trim()
    .split(":")
    .reduce((sec, part) => sec * 60 + Number(part), 0);
}

/** 応答の中から、その動画の再生キューの項目（playlistPanelVideoRenderer）を探す */
function findPanelVideo(node: unknown, videoId: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const v of node) {
      const found = findPanelVideo(v, videoId);
      if (found) return found;
    }
    return null;
  }
  const o = obj(node);
  if (!o) return null;
  const r = obj(o.playlistPanelVideoRenderer);
  if (r?.videoId === videoId) return r;
  for (const v of Object.values(o)) {
    const found = findPanelVideo(v, videoId);
    if (found) return found;
  }
  return null;
}

type Run = { text: string; pageType: string | null };

function runs(v: unknown): Run[] {
  const list = obj(v)?.runs;
  if (!Array.isArray(list)) return [];
  return list.flatMap((r) => {
    const text = str(obj(r)?.text);
    if (!text) return [];
    const config = obj(
      obj(
        obj(obj(obj(r)?.navigationEndpoint)?.browseEndpoint)?.browseEndpointContextSupportedConfigs,
      )?.browseEndpointContextMusicConfig,
    );
    return [{ text, pageType: str(config?.pageType) }];
  });
}

/**
 * YouTube Music の内部 API（youtubei/v1/next）の応答を読む。
 * 再生キューの先頭にその動画があり、`林明日香 • 咲 • 2003年` の各部分に、アーティスト・アルバムのページへのリンクが付く。
 * リリース日は年しか無いので持たない。アーティストのリンクが無い（一般の動画）ときは null にして、次の方法に任せる。
 */
export function parseMusicNext(body: unknown, videoId: string): Parsed | null {
  const r = findPanelVideo(body, videoId);
  const title = runs(r?.title)
    .map((x) => x.text)
    .join("")
    .trim();
  const byline = runs(r?.longBylineText);
  const artists = [
    ...new Set(byline.filter((x) => x.pageType === "MUSIC_PAGE_TYPE_ARTIST").map((x) => x.text)),
  ];
  if (!r || !title || artists.length === 0) return null;
  const [artist, ...credits] = artists;
  return {
    title,
    artist,
    credits,
    album: byline.find((x) => x.pageType === "MUSIC_PAGE_TYPE_ALBUM")?.text ?? null,
    releaseDate: null,
    durationSec: parseClock(runs(r.lengthText)[0]?.text),
  };
}

/** oEmbed は曲名（動画タイトル）とチャンネル名だけ */
export function parseOembed(body: unknown): Parsed | null {
  const title = str(obj(body)?.title);
  if (!title) return null;
  return fromTitleAndChannel(title, str(obj(body)?.author_name) ?? "");
}

type Attempt = { method: SourceSong["method"]; run: () => Promise<Parsed | null> };

export async function fetchYoutube(
  id: string,
  apiKey: string | undefined = process.env.YOUTUBE_API_KEY,
): Promise<SourceSong> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const attempts: Attempt[] = [
    {
      method: "music_next",
      run: async () =>
        parseMusicNext(
          await fetchJson(MUSIC_NEXT_URL, { videoId: id, context: { client: MUSIC_CLIENT } }),
          id,
        ),
    },
    ...(apiKey
      ? [
          {
            method: "data_api" as const,
            run: async () =>
              parseDataApi(
                await fetchJson(
                  `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({
                    part: "snippet,contentDetails",
                    id,
                    key: apiKey,
                  })}`,
                ),
              ),
          },
        ]
      : []),
    // データセンターの IP からは 429 で弾かれることがある。そのときは oEmbed に進む
    {
      method: "watch_html",
      run: async () => parseWatchHtml((await fetchText(`${watch}&hl=ja`)).body),
    },
    {
      method: "oembed",
      run: async () =>
        parseOembed(
          await fetchJson(
            `https://www.youtube.com/oembed?${new URLSearchParams({ url: watch, format: "json" })}`,
          ),
        ),
    },
  ];

  let lastError: SourceError | null = null;
  for (const { method, run } of attempts) {
    try {
      const parsed = await run();
      if (parsed)
        return { service: "youtube_music", method, id, url: youtubeMusicUrl(id), ...parsed };
      lastError = new SourceError("meta_not_found", `YouTube ${method}: no video details`);
    } catch (e) {
      lastError = e instanceof SourceError ? e : new SourceError("fetch_failed", String(e));
    }
    console.warn(`[youtube] ${method} failed for ${id}: ${lastError.message}`);
  }
  throw lastError ?? new SourceError("fetch_failed", "YouTube: no attempt");
}
