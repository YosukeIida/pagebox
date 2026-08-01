// Access セットアップスクリプトの純粋な部分の回帰テスト。
// 過去に踏んだ2つの失敗を固定する:
//   1. 既存アプリの重複チェックが "domain/path" の結合形で比較できていなかった
//   2. `--env=stage` が拾えず、本番設定にフォールバックしていた
import { describe, expect, test } from "bun:test";
import { buildApps, fullDomain, parseArgs } from "./setup-cloudflare-access";

describe("fullDomain", () => {
  // API は path 付きアプリの domain を "pagebox.iodine2.net/d" の形で返す
  test("path があれば結合形にする（API のレスポンス形に合わせる）", () => {
    expect(fullDomain("pagebox.iodine2.net", "/d")).toBe("pagebox.iodine2.net/d");
  });

  test("先頭スラッシュが無い path でも二重にならない", () => {
    expect(fullDomain("pagebox.iodine2.net", "d")).toBe("pagebox.iodine2.net/d");
  });

  test("path が無ければ domain のまま", () => {
    expect(fullDomain("pagebox.iodine2.net")).toBe("pagebox.iodine2.net");
    expect(fullDomain("stage.pagebox.iodine2.net", undefined)).toBe("stage.pagebox.iodine2.net");
  });

  // 本番の2アプリが互いに衝突せず、かつ実 API の値と一致すること
  test("本番の2アプリが別の識別子になる", () => {
    const apps = buildApps("production", []);
    const keys = apps.map((a) => fullDomain(a.domain, a.path));
    expect(keys).toEqual(["pagebox.iodine2.net", "pagebox.iodine2.net/d"]);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("parseArgs", () => {
  test("--env stage / --env=stage のどちらも解釈する", () => {
    expect(parseArgs(["--env", "stage"])).toEqual({ env: "stage" });
    expect(parseArgs(["--env=stage"])).toEqual({ env: "stage" });
    expect(parseArgs(["--env", "production"])).toEqual({ env: "production" });
    expect(parseArgs(["--env=production"])).toEqual({ env: "production" });
  });

  // 既定値を持たせると、引数の打ち間違いが本番設定での実行になる
  test("--env が無ければエラー（本番へフォールバックしない）", () => {
    expect(parseArgs([])).toHaveProperty("error");
  });

  test("未知の引数・未知の環境名は拒否する", () => {
    expect(parseArgs(["--environment=stage"])).toHaveProperty("error");
    expect(parseArgs(["--env", "staging"])).toHaveProperty("error");
    expect(parseArgs(["stage"])).toHaveProperty("error");
  });

  test("--env の値が欠けていたらエラー", () => {
    expect(parseArgs(["--env"])).toHaveProperty("error");
    expect(parseArgs(["--env", "--verbose"])).toHaveProperty("error");
  });
});

describe("buildApps", () => {
  test("本番は view 用アプリを作らない（アプリが無いホスト = 公開）", () => {
    const domains = buildApps("production", []).map((a) => a.domain);
    expect(domains).not.toContain("view.pagebox.iodine2.net");
  });

  test("stage も view 用アプリを作らない", () => {
    const domains = buildApps("stage", ["a@example.com"]).map((a) => a.domain);
    expect(domains).toEqual(["stage.pagebox.iodine2.net"]);
  });

  test("stage のポリシーは指定した管理者だけを許可する", () => {
    const [app] = buildApps("stage", ["a@example.com", "b@example.com"]);
    expect(app.policy.decision).toBe("allow");
    expect(app.policy.include).toEqual([
      { email: { email: "a@example.com" } },
      { email: { email: "b@example.com" } },
    ]);
    // 全員許可へのフォールバックを持たないこと
    expect(JSON.stringify(app.policy.include)).not.toContain("everyone");
  });

  test("stage で管理者が空なら黙って全員許可にせず失敗する", () => {
    expect(() => buildApps("stage", [])).toThrow();
  });

  test("main フラグは各環境でちょうど1つ", () => {
    for (const env of ["production", "stage"] as const) {
      const apps = buildApps(env, ["a@example.com"]);
      expect(apps.filter((a) => a.main)).toHaveLength(1);
    }
  });
});
