// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => vi.fn<(props: { beforeSend?: unknown }) => null>(() => null));
vi.mock("@vercel/analytics/next", () => ({ Analytics: analytics }));

import { redactEvent, WebAnalytics } from "./WebAnalytics";

describe("WebAnalytics", () => {
  it("URL を伏せる処理を付けて Analytics を置く", () => {
    render(<WebAnalytics />);
    expect(analytics.mock.calls[0][0].beforeSend).toBe(redactEvent);
  });

  it("送る前に URL からクエリと ID を落とす", () => {
    expect(
      redactEvent({
        type: "pageview",
        url: "https://setlistic.laplusdestiny.com/add?url=https%3A%2F%2Fexample.com",
      }),
    ).toEqual({ type: "pageview", url: "https://setlistic.laplusdestiny.com/add" });
  });
});
