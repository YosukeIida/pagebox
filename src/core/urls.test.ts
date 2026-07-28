// 公開 URL 組み立てとビューア判定の回帰テスト。
// worker はここの viewHostname() の完全一致でビューア経路に入るかを決めるため、
// 「本番の設定が stage のホストを拾わない」「その逆も拾わない」が壊れると
// 配信経路が丸ごとおかしくなる。
import { describe, expect, test } from "bun:test";
import { ogImageUrl, viewHostname, viewUrl, type Origins } from "./urls";

const prod: Origins = {
  app: "https://pagebox.iodine2.net",
  view: "https://view.pagebox.iodine2.net",
};
const stage: Origins = {
  app: "https://stage.pagebox.iodine2.net",
  view: "https://view.stage.pagebox.iodine2.net",
};

describe("viewUrl / ogImageUrl", () => {
  test("view は view オリジン、OGP 画像は app オリジンを使う", () => {
    expect(viewUrl(prod, "abc123")).toBe("https://view.pagebox.iodine2.net/abc123");
    expect(ogImageUrl(prod, "abc123")).toBe("https://pagebox.iodine2.net/d/abc123/og.png");
  });

  test("stage では stage のオリジンになる", () => {
    expect(viewUrl(stage, "abc123")).toBe("https://view.stage.pagebox.iodine2.net/abc123");
    expect(ogImageUrl(stage, "abc123")).toBe("https://stage.pagebox.iodine2.net/d/abc123/og.png");
  });

  test("オリジン末尾のスラッシュを吸収してスラッシュが重複しない", () => {
    expect(viewUrl({ app: "https://a.test/", view: "https://v.test/" }, "abc")).toBe("https://v.test/abc");
    expect(ogImageUrl({ app: "https://a.test/", view: "https://v.test/" }, "abc")).toBe("https://a.test/d/abc/og.png");
  });
});

describe("viewHostname（worker のビューア判定）", () => {
  test("view オリジンのホスト名を返す", () => {
    expect(viewHostname(prod)).toBe("view.pagebox.iodine2.net");
    expect(viewHostname(stage)).toBe("view.stage.pagebox.iodine2.net");
  });

  test("app ホストをビューアと誤認しない", () => {
    expect(viewHostname(prod)).not.toBe("pagebox.iodine2.net");
    expect(viewHostname(stage)).not.toBe("stage.pagebox.iodine2.net");
  });

  // 以前は startsWith("view.") で判定していたため、view.stage.… まで拾ってしまっていた
  test("本番と stage のビューアホストが混ざらない", () => {
    expect(viewHostname(prod)).not.toBe(viewHostname(stage));
    expect(viewHostname(prod)).not.toBe("view.stage.pagebox.iodine2.net");
    expect(viewHostname(stage)).not.toBe("view.pagebox.iodine2.net");
  });

  test("URL として解釈できない値では空文字を返し、判定が通らない", () => {
    expect(viewHostname({ app: "", view: "not a url" })).toBe("");
    // 空文字はどんなホスト名とも一致しないので、ビューア経路には入らない
    expect(viewHostname({ app: "", view: "" })).not.toBe("pagebox.iodine2.net");
  });
});
