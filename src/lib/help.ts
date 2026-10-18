// ヘルプページ（/help）の場所。チュートリアルや設定・エラー表示から節へ直接リンクする。

export const HELP_PATH = "/help";

/** ヘルプの節の id（URL の # に使う） */
export const HELP_SECTIONS = {
  trouble: "trouble",
  register: "register",
  services: "services",
  edit: "edit",
  tags: "tags",
  search: "search",
  random: "random",
  homeScreen: "home-screen",
  pc: "pc",
  data: "data",
  account: "account",
  contact: "contact",
} as const;

export type HelpSection = keyof typeof HELP_SECTIONS;

export const helpHref = (section?: HelpSection) =>
  section ? `${HELP_PATH}#${HELP_SECTIONS[section]}` : HELP_PATH;
