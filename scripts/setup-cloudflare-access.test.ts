// Access セットアップスクリプトの純粋な部分の回帰テスト。
// 過去に踏んだ3つの失敗を固定する:
//   1. 既存アプリの重複チェックが "domain/path" の結合形で比較できていなかった
//   2. `--env=stage` が拾えず、本番設定にフォールバックしていた
//   3. 既存アプリを見つけるとポリシーを確認せず、壊れた状態のまま再実行が成功していた
import { describe, expect, test } from "bun:test";
import { type AccessPolicy, buildApps, fullDomain, parseArgs, planPolicy } from "./setup-cloudflare-access";

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

describe("planPolicy", () => {
  const spec: AccessPolicy = {
    name: "Allow admins",
    decision: "allow",
    include: [{ email: { email: "a@example.com" } }, { email: { email: "b@example.com" } }],
  };

  // アプリ作成に成功しポリシー作成で失敗した状態。以前はここを「既に存在します」で
  // 素通りしていたため、再実行しても全員拒否のまま成功していた。
  test("ポリシーが0件なら作り直す", () => {
    expect(planPolicy([], spec)).toEqual({ action: "create", reason: expect.any(String) });
  });

  test("定義どおりなら何もしない", () => {
    expect(planPolicy([{ id: "p1", ...spec }], spec)).toEqual({ action: "none" });
  });

  // include は OR 条件の集合。順序差で毎回 update を投げないこと
  test("include の順序が違うだけなら何もしない", () => {
    const reordered = { id: "p1", ...spec, include: [...spec.include].reverse() };
    expect(planPolicy([reordered], spec)).toEqual({ action: "none" });
  });

  test("include が変わっていれば同じポリシーを更新する", () => {
    const stale = { id: "p1", ...spec, include: [{ email: { email: "a@example.com" } }] };
    expect(planPolicy([stale], spec)).toMatchObject({ action: "update", policyId: "p1" });
  });

  // bypass が allow に書き換わっていると公開ビューが壊れる
  test("decision が変わっていれば更新する", () => {
    const flipped = { id: "p1", ...spec, decision: "bypass" };
    expect(planPolicy([flipped], spec)).toMatchObject({ action: "update", policyId: "p1" });
  });

  // 人が手で入れたポリシーを消したり、意図しない許可を足したりしない
  test("想定名が無く別のポリシーだけある場合は触らず conflict にする", () => {
    const foreign = { id: "p9", name: "Allow everyone", decision: "allow", include: [{ everyone: {} }] };
    expect(planPolicy([foreign], spec)).toMatchObject({ action: "conflict" });
  });

  test("想定名があれば別のポリシーが並んでいても conflict にしない", () => {
    const foreign = { id: "p9", name: "Something else", decision: "allow", include: [{ everyone: {} }] };
    expect(planPolicy([foreign, { id: "p1", ...spec }], spec)).toEqual({ action: "none" });
  });
});
