// stage 設定ガードの回帰テスト。
// 「本番の値に書き換えたら deploy 前に落ちる」ことを、実際の wrangler.toml と
// 壊した設定オブジェクトの両方で確かめる。
import { describe, expect, test } from "bun:test";
import { checkStageConfig, EXPECTED_STAGE_APP_HOST, EXPECTED_STAGE_VIEW_HOST } from "./check-stage-config";
import actualConfig from "../deploy/cloudflare/wrangler.toml";

// 正しい設定の最小形。各テストでここから1箇所だけ壊す。
function validConfig() {
  return {
    routes: [
      { pattern: "pagebox.iodine2.net", custom_domain: true },
      { pattern: "view.pagebox.iodine2.net", custom_domain: true },
    ],
    d1_databases: [{ binding: "DB", database_name: "pagebox", database_id: "prod-d1-id" }],
    kv_namespaces: [{ binding: "OG_CACHE_KV", id: "prod-kv-id" }],
    r2_buckets: [{ binding: "STORAGE", bucket_name: "pagebox-blobs" }],
    analytics_engine_datasets: [{ binding: "ANALYTICS", dataset: "pagebox_events" }],
    ratelimits: [{ name: "RATE_LIMITER", namespace_id: "10001" }],
    env: {
      stage: {
        routes: [
          { pattern: EXPECTED_STAGE_APP_HOST, custom_domain: true },
          { pattern: EXPECTED_STAGE_VIEW_HOST, custom_domain: true },
        ],
        workers_dev: false,
        preview_urls: false,
        vars: {
          APP_ORIGIN: `https://${EXPECTED_STAGE_APP_HOST}`,
          VIEW_ORIGIN: `https://${EXPECTED_STAGE_VIEW_HOST}`,
        },
        d1_databases: [{ binding: "DB", database_name: "pagebox-stage", database_id: "stage-d1-id" }],
        kv_namespaces: [{ binding: "OG_CACHE_KV", id: "stage-kv-id" }],
        r2_buckets: [{ binding: "STORAGE", bucket_name: "pagebox-blobs-stage" }],
        analytics_engine_datasets: [{ binding: "ANALYTICS", dataset: "pagebox_events_stage" }],
        ratelimits: [{ name: "RATE_LIMITER", namespace_id: "10002" }],
      },
    },
  };
}

describe("checkStageConfig", () => {
  test("正しい設定なら問題なし", () => {
    expect(checkStageConfig(validConfig())).toEqual([]);
  });

  test("[env.stage] が無ければ落ちる", () => {
    expect(checkStageConfig({ routes: [] })).toHaveLength(1);
  });

  // routes は環境に継承されるため、ここが一番危険
  test("stage の routes が本番ドメインに書き換わったら落ちる", () => {
    const cfg = validConfig();
    cfg.env.stage.routes = [
      { pattern: "pagebox.iodine2.net", custom_domain: true },
      { pattern: "view.pagebox.iodine2.net", custom_domain: true },
    ];
    const problems = checkStageConfig(cfg);
    expect(problems.some((p) => p.includes("期待値と違う"))).toBe(true);
    expect(problems.some((p) => p.includes("本番の routes と重複"))).toBe(true);
  });

  test("routes が1つ欠けたら落ちる", () => {
    const cfg = validConfig();
    cfg.env.stage.routes = [{ pattern: EXPECTED_STAGE_APP_HOST, custom_domain: true }];
    expect(checkStageConfig(cfg).some((p) => p.includes("期待値と違う"))).toBe(true);
  });

  test("custom_domain が抜けたら落ちる", () => {
    const cfg = validConfig();
    cfg.env.stage.routes[1] = { pattern: EXPECTED_STAGE_VIEW_HOST, custom_domain: false };
    expect(checkStageConfig(cfg).some((p) => p.includes("custom_domain"))).toBe(true);
  });

  test.each([
    ["D1 database_id", (c: ReturnType<typeof validConfig>) => { c.env.stage.d1_databases[0].database_id = "prod-d1-id"; }],
    ["D1 database_name", (c: ReturnType<typeof validConfig>) => { c.env.stage.d1_databases[0].database_name = "pagebox"; }],
    ["KV id", (c: ReturnType<typeof validConfig>) => { c.env.stage.kv_namespaces[0].id = "prod-kv-id"; }],
    ["R2 bucket", (c: ReturnType<typeof validConfig>) => { c.env.stage.r2_buckets[0].bucket_name = "pagebox-blobs"; }],
    ["Analytics dataset", (c: ReturnType<typeof validConfig>) => { c.env.stage.analytics_engine_datasets[0].dataset = "pagebox_events"; }],
    ["rate limit namespace", (c: ReturnType<typeof validConfig>) => { c.env.stage.ratelimits[0].namespace_id = "10001"; }],
  ])("binding が本番と同じ実体を指したら落ちる: %s", (_label, corrupt) => {
    const cfg = validConfig();
    corrupt(cfg);
    expect(checkStageConfig(cfg).some((p) => p.includes("本番と同じ実体"))).toBe(true);
  });

  // 非継承の binding を書き忘れると binding 欠落、継承されるなら本番共有になる
  test("binding の定義漏れで落ちる", () => {
    const cfg = validConfig();
    cfg.env.stage.ratelimits = [];
    expect(checkStageConfig(cfg).some((p) => p.includes("定義されていない"))).toBe(true);
  });

  test("TODO_ プレースホルダが残っていたら落ちる", () => {
    const cfg = validConfig();
    cfg.env.stage.d1_databases[0].database_id = "TODO_STAGE_D1_DATABASE_ID";
    expect(checkStageConfig(cfg).some((p) => p.includes("プレースホルダ"))).toBe(true);
  });

  test("origin が routes と食い違ったら落ちる", () => {
    const cfg = validConfig();
    cfg.env.stage.vars.VIEW_ORIGIN = "https://view.pagebox.iodine2.net";
    expect(checkStageConfig(cfg).some((p) => p.includes("VIEW_ORIGIN"))).toBe(true);
  });

  test("workers_dev / preview_urls の明示が消えたら落ちる", () => {
    const cfg = validConfig();
    cfg.env.stage.workers_dev = true;
    cfg.env.stage.preview_urls = true;
    const problems = checkStageConfig(cfg);
    expect(problems.some((p) => p.includes("workers_dev"))).toBe(true);
    expect(problems.some((p) => p.includes("preview_urls"))).toBe(true);
  });
});

describe("実際の wrangler.toml", () => {
  // 初回セットアップ前は TODO_ が残っているため、それ以外の問題が無いことを確認する。
  // セットアップ後は problems が空になる（CI の deploy ゲートがそれを要求する）。
  test("プレースホルダ以外の問題が無い", () => {
    const problems = checkStageConfig(actualConfig).filter((p) => !p.includes("プレースホルダ"));
    expect(problems).toEqual([]);
  });

  test("stage の routes が本番と重複していない", () => {
    const cfg = actualConfig as { routes: { pattern: string }[]; env: { stage: { routes: { pattern: string }[] } } };
    const prod = cfg.routes.map((r) => r.pattern);
    for (const r of cfg.env.stage.routes) expect(prod).not.toContain(r.pattern);
  });
});
