import { describe, expect, it } from "vitest";
import {
  conditionsFromParams,
  conditionsToHref,
  conditionsToParams,
  countConditions,
  cycleTag,
  describeConditions,
  EMPTY_CONDITIONS,
  hasConditions,
  normalizeConditions,
  normalizeSearchText,
  pickRandom,
  splitWords,
  tagState,
  toRpcParams,
} from "./conditions";

const A = "123e4567-e89b-42d3-a456-426614174000";
const B = "223e4567-e89b-42d3-a456-426614174000";
const C = "323e4567-e89b-42d3-a456-426614174000";

describe("splitWords / normalizeSearchText", () => {
  it("全角空白でも区切り、NFKC・小文字にそろえる", () => {
    expect(splitWords("　ＹＯＡＳＯＢＩ　夜に駆ける ")).toEqual(["yoasobi", "夜に駆ける"]);
  });
  it("重複は除き、語数・長さに上限がある", () => {
    expect(splitWords("a a A")).toEqual(["a"]);
    expect(splitWords("1 2 3 4 5 6 7")).toHaveLength(5);
    expect(splitWords("あ".repeat(80))[0]).toHaveLength(50);
  });
  it("空・空白だけなら語なし", () => {
    expect(splitWords("   　")).toEqual([]);
  });
  it("半角カナは全角カナに寄る。ひらがなとカタカナは区別する", () => {
    expect(normalizeSearchText("ﾛｯｸ")).toBe("ロック");
    expect(normalizeSearchText("ろっく")).not.toBe(normalizeSearchText("ロック"));
  });
});

describe("normalizeConditions", () => {
  it("空・不正な入力は既定値", () => {
    expect(normalizeConditions(null)).toEqual(EMPTY_CONDITIONS);
    expect(normalizeConditions("x")).toEqual(EMPTY_CONDITIONS);
    expect(normalizeConditions({ include: "x", decades: 5, sort: "evil" })).toEqual(
      EMPTY_CONDITIONS,
    );
  });
  it("UUIDでないタグIDを捨て、重複を除く", () => {
    expect(normalizeConditions({ include: [A, A, "x; drop table", 3] }).include).toEqual([A]);
  });
  it("同じタグが含める・除外の両方にあれば除外を優先", () => {
    const c = normalizeConditions({ include: [A, B], exclude: [B, C] });
    expect(c.include).toEqual([A]);
    expect(c.exclude).toEqual([B, C]);
  });
  it("許可された値だけを通す", () => {
    const c = normalizeConditions({
      decades: [2010, 1850, 2020],
      durations: ["lt3", "bad"],
      keys: ["up", "x"],
      lastEase: "hard",
      sort: "title_asc",
      tagMode: "or",
    });
    expect(c).toMatchObject({
      decades: [2010, 2020],
      durations: ["lt3"],
      keys: ["up"],
      lastEase: "hard",
      sort: "title_asc",
      tagMode: "or",
    });
  });
  it("文字列は trim して長さを制限する", () => {
    expect(normalizeConditions({ artist: "  YOASOBI " }).artist).toBe("YOASOBI");
    expect(normalizeConditions({ q: "あ".repeat(500) }).q).toHaveLength(200);
  });
});

describe("hasConditions", () => {
  it("並び順だけでは条件ありにならない", () => {
    expect(hasConditions({ ...EMPTY_CONDITIONS, sort: "title_asc" })).toBe(false);
    expect(hasConditions({ ...EMPTY_CONDITIONS, q: "  " })).toBe(false);
  });
  it("いずれかの条件があれば true", () => {
    expect(hasConditions({ ...EMPTY_CONDITIONS, exclude: [A] })).toBe(true);
    expect(hasConditions({ ...EMPTY_CONDITIONS, lastEase: "easy" })).toBe(true);
    expect(hasConditions({ ...EMPTY_CONDITIONS, q: "夜" })).toBe(true);
  });
});

describe("URL との相互変換", () => {
  const full = normalizeConditions({
    q: "夜 駆ける",
    tagMode: "or",
    include: [A, B],
    exclude: [C],
    artist: "YOASOBI",
    genre: "J-Pop",
    decades: [2010, 2020],
    durations: ["3to4", "gte5"],
    keys: ["down", "zero"],
    lastEase: "not_hard",
    sort: "last_sung_asc",
  });

  it("往復しても同じ", () => {
    const params = conditionsToParams(full);
    expect(conditionsFromParams(new URLSearchParams(params.toString()))).toEqual(full);
  });
  it("既定値は省略する", () => {
    expect(conditionsToParams(EMPTY_CONDITIONS).toString()).toBe("");
    expect(conditionsToHref(EMPTY_CONDITIONS)).toBe("/");
    expect(conditionsToParams({ ...EMPTY_CONDITIONS, include: [A] }).toString()).toBe(
      `t=${encodeURIComponent(A)}`,
    );
  });
  it("URLの値が壊れていても例外にせず、安全な値に落とす", () => {
    const c = conditionsFromParams(
      new URLSearchParams("t=bad,%27;--&dec=abc&len=zzz&ease=x&sort=1;drop"),
    );
    expect(c).toEqual(EMPTY_CONDITIONS);
  });
});

describe("toRpcParams（検索条件 → DB関数の引数）", () => {
  it("既定の条件は絞り込みなし、並び順は既定を使う", () => {
    expect(toRpcParams(EMPTY_CONDITIONS, "created_desc")).toEqual({
      words: [],
      tag_mode: "and",
      tag_include: [],
      tag_exclude: [],
      artist: null,
      genre: null,
      decades: [],
      duration_ranges: [],
      key_ranges: [],
      last_ease: null,
      sort: "created_desc",
    });
  });
  it("「十八番 AND 盛り上げ、ただしバラードを除く」", () => {
    const p = toRpcParams(
      normalizeConditions({ tagMode: "and", include: [A, B], exclude: [C] }),
      "created_desc",
    );
    expect(p).toMatchObject({ tag_mode: "and", tag_include: [A, B], tag_exclude: [C] });
  });
  it("曲の長さ・キーのバケットを数値範囲にする", () => {
    const p = toRpcParams(
      normalizeConditions({ durations: ["lt3", "gte5"], keys: ["down", "zero", "up"] }),
      "created_desc",
    );
    expect(p.duration_ranges).toEqual([{ max: 179999 }, { min: 300000 }]);
    expect(p.key_ranges).toEqual([{ max: -1 }, { min: 0, max: 0 }, { min: 1 }]);
  });
  it("条件の並び順を優先し、検索語は正規化する", () => {
    const p = toRpcParams(
      normalizeConditions({ sort: "title_asc", q: "ＹＯＡ", artist: "ＹＯ" }),
      "created_desc",
    );
    expect(p).toMatchObject({ sort: "title_asc", words: ["yoa"], artist: "yo" });
  });
});

describe("describeConditions", () => {
  const names: Record<string, string> = { [A]: "十八番", [B]: "盛り上げ", [C]: "バラード" };
  const name = (id: string) => names[id];

  it("AND・OR・除外を日本語にする", () => {
    expect(
      describeConditions(normalizeConditions({ include: [A, B], exclude: [C] }), name),
    ).toEqual(["#十八番 かつ #盛り上げ", "#バラード を除く"]);
    expect(
      describeConditions(normalizeConditions({ tagMode: "or", include: [A, B] }), name),
    ).toEqual(["#十八番 または #盛り上げ"]);
  });
  it("存在しない（削除済み）タグは出さない", () => {
    expect(describeConditions(normalizeConditions({ include: [A] }), () => undefined)).toEqual([]);
  });
  it("その他の条件", () => {
    const out = describeConditions(
      normalizeConditions({
        q: "夜",
        artist: "YOASOBI",
        decades: [2010],
        keys: ["down"],
        lastEase: "easy",
      }),
      name,
    );
    expect(out).toEqual([
      "キーワード「夜」",
      "アーティスト「YOASOBI」",
      "2010年代",
      "キーを下げる",
      "最近余裕だった",
    ]);
  });
});

describe("cycleTag / tagState", () => {
  it("なし → 含める → 除外 → なし", () => {
    let c = EMPTY_CONDITIONS;
    expect(tagState(c, A)).toBe("none");
    c = cycleTag(c, A);
    expect(tagState(c, A)).toBe("include");
    c = cycleTag(c, A);
    expect(tagState(c, A)).toBe("exclude");
    expect(c.include).toEqual([]);
    c = cycleTag(c, A);
    expect(tagState(c, A)).toBe("none");
  });
  it("他のタグの状態は変えない", () => {
    const c = cycleTag(cycleTag(EMPTY_CONDITIONS, A), B);
    expect(c.include).toEqual([A, B]);
  });
});

describe("pickRandom", () => {
  it("空なら null", () => {
    expect(pickRandom([])).toBeNull();
  });
  it("rng に応じて選ぶ。上限（1.0 近傍）でも範囲内", () => {
    const xs = ["a", "b", "c"];
    expect(pickRandom(xs, () => 0)).toBe("a");
    expect(pickRandom(xs, () => 0.5)).toBe("b");
    expect(pickRandom(xs, () => 0.999999)).toBe("c");
    expect(pickRandom(xs, () => 1)).toBe("c");
  });
});

describe("countConditions", () => {
  it("タグは1つずつ、その他は項目ごとに1つと数える", () => {
    expect(countConditions(EMPTY_CONDITIONS)).toBe(0);
    expect(
      countConditions(
        normalizeConditions({
          include: [A, B],
          exclude: [C],
          q: "夜",
          decades: [2010, 2020],
          lastEase: "easy",
        }),
      ),
    ).toBe(6);
  });
  it("並び順は数えない", () => {
    expect(countConditions({ ...EMPTY_CONDITIONS, sort: "title_asc" })).toBe(0);
  });
});
