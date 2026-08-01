// 公開 URL 組み立てとビューア判定の回帰テスト。
// worker はここの viewHostname() の完全一致でビューア経路に入るかを決めるため、
// 「本番の設定が stage のホストを拾わない」「その逆も拾わない」が壊れると
// 配信経路が丸ごとおかしくなる。
import { describe, expect, test } from "bun:test";
import { ogImageUrl, parseViewPath, viewHostname, viewUrl, type Origins } from "./urls";

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

  // 共有 URL は常に最新版。version を渡したときだけ版固定 URL になる
  test("version を渡すと版固定 URL になる", () => {
    expect(viewUrl(prod, "abc123", 2)).toBe("https://view.pagebox.iodine2.net/abc123/v2");
    expect(ogImageUrl(prod, "abc123", 2)).toBe("https://pagebox.iodine2.net/d/abc123/v2/og.png");
  });

  test("version 省略時は版セグメントが付かない（共有 URL は変わらない）", () => {
    // オリジンにも "view" が含まれるので、部分文字列ではなく pathname で判定する
    expect(new URL(viewUrl(prod, "abc123")).pathname).toBe("/abc123");
    expect(viewUrl(prod, "abc123", undefined)).toBe(viewUrl(prod, "abc123"));
  });

  // ローカルの開発ビューアは /raw 配下に生えるため、パスを含むオリジンも壊れないこと
  test("パスを含むオリジン（ローカルの /raw）でも組み立てられる", () => {
    const local: Origins = { app: "http://localhost:3000", view: "http://localhost:3000/raw" };
    expect(viewUrl(local, "abc123")).toBe("http://localhost:3000/raw/abc123");
    expect(viewUrl(local, "abc123", 1)).toBe("http://localhost:3000/raw/abc123/v1");
  });
});

describe("parseViewPath（worker の版パス解釈）", () => {
  test("最新版と版固定を解釈する", () => {
    expect(parseViewPath("/abc123")).toEqual({ slug: "abc123" });
    expect(parseViewPath("/abc123/v2")).toEqual({ slug: "abc123", version: 2 });
  });

  test("末尾スラッシュは最新版として扱う", () => {
    expect(parseViewPath("/abc123/")).toEqual({ slug: "abc123" });
  });

  test.each([
    ["空パス", "/"],
    ["版セグメントが不正", "/abc123/vX"],
    ["v が無い2セグメント", "/abc123/2"],
    ["v0 は不正", "/abc123/v0"],
    ["セグメントが多すぎる", "/abc123/v2/extra"],
  ])("解釈できないパスは null: %s", (_label, path) => {
    expect(parseViewPath(path)).toBeNull();
  });

  test("viewUrl で作った URL のパスを解釈し戻せる", () => {
    for (const version of [undefined, 1, 42]) {
      const path = new URL(viewUrl(prod, "abc123", version)).pathname;
      expect(parseViewPath(path)).toEqual(version === undefined ? { slug: "abc123" } : { slug: "abc123", version });
    }
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
