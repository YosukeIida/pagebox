// wrangler.toml の [env.stage] が本番から正しく分離されているかを機械的に検証する。
//
// 表示して人が見るだけでは CI で誰も見ないため、fail closed にするのが目的。
// stage-deploy / stage-deploy-dry と GitHub Actions の両方がこれを通してから deploy する。
//
// 検証する内容:
//   1. stage の routes が期待する2ホストと完全一致し、すべて custom_domain である
//   2. stage の routes が本番の routes と重複しない（routes は環境に継承されるため事故が起きやすい）
//   3. TODO_ プレースホルダが残っていない
//   4. 各 binding（D1 / KV / R2 / Analytics / rate limit）が本番と別の実体を指している
//   5. APP_ORIGIN / VIEW_ORIGIN のホスト名が stage の routes と一致している
//   6. stage で workers_dev / preview_urls が無効になっている

export const EXPECTED_STAGE_APP_HOST = "stage.pagebox.iodine2.net";
export const EXPECTED_STAGE_VIEW_HOST = "view.stage.pagebox.iodine2.net";

interface Route {
  pattern?: string;
  custom_domain?: boolean;
}

// 本番と stage で「同じ実体を指していないか」を比べる対象。
// 値が一致したら stage が本番のリソースを使っていることになる。
const BINDINGS: { key: string; label: string; ids: (b: Record<string, unknown>) => unknown[] }[] = [
  { key: "d1_databases", label: "D1", ids: (b) => [b.database_name, b.database_id] },
  { key: "kv_namespaces", label: "KV", ids: (b) => [b.id] },
  { key: "r2_buckets", label: "R2", ids: (b) => [b.bucket_name] },
  { key: "analytics_engine_datasets", label: "Analytics Engine", ids: (b) => [b.dataset] },
  { key: "ratelimits", label: "rate limit", ids: (b) => [b.namespace_id] },
];

function hostOf(origin: unknown): string | null {
  if (typeof origin !== "string") return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

// stage 設定の中に残っている TODO_ プレースホルダのパスを列挙する
function findPlaceholders(value: unknown, path: string, found: string[]): void {
  if (typeof value === "string") {
    if (value.includes("TODO_")) found.push(`${path} = "${value}"`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findPlaceholders(v, `${path}[${i}]`, found));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) findPlaceholders(v, `${path}.${k}`, found);
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

// 問題があればその説明を並べて返す。空配列なら OK。
export function checkStageConfig(cfg: unknown): string[] {
  const problems: string[] = [];
  const root = (cfg ?? {}) as Record<string, unknown>;
  const env = (root.env ?? {}) as Record<string, unknown>;
  const stage = env.stage as Record<string, unknown> | undefined;

  if (!stage) return ["[env.stage] が wrangler.toml に存在しない"];

  // 1. routes が期待する2ホストと完全一致するか
  const expected = [EXPECTED_STAGE_APP_HOST, EXPECTED_STAGE_VIEW_HOST];
  const stageRoutes = asArray(stage.routes) as Route[];
  const stagePatterns = stageRoutes.map((r) => r.pattern ?? "");
  const sorted = [...stagePatterns].sort();
  if (JSON.stringify(sorted) !== JSON.stringify([...expected].sort())) {
    problems.push(
      `[env.stage].routes が期待値と違う: 実際 [${stagePatterns.join(", ")}] / 期待 [${expected.join(", ")}]`,
    );
  }
  for (const r of stageRoutes) {
    if (r.custom_domain !== true) {
      problems.push(`[env.stage].routes の "${r.pattern}" に custom_domain = true が無い`);
    }
  }

  // 2. 本番の routes と重複していないか（重複 = 本番ドメインを stage worker が奪う）
  const prodPatterns = (asArray(root.routes) as Route[]).map((r) => r.pattern ?? "");
  const overlap = stagePatterns.filter((p) => prodPatterns.includes(p));
  if (overlap.length > 0) {
    problems.push(`[env.stage].routes が本番の routes と重複している: ${overlap.join(", ")}`);
  }

  // 3. TODO_ プレースホルダが残っていないか（未セットアップのまま deploy させない）
  const placeholders: string[] = [];
  findPlaceholders(stage, "env.stage", placeholders);
  for (const p of placeholders) {
    problems.push(`未設定のプレースホルダが残っている: ${p}（docs/deploy-stage.md の初回セットアップ参照）`);
  }

  // 4. binding が本番と別の実体を指しているか
  for (const { key, label, ids } of BINDINGS) {
    const prod = asArray(root[key]);
    const stageBindings = asArray(stage[key]);

    if (prod.length > 0 && stageBindings.length === 0) {
      problems.push(
        `[env.stage] に ${label}（${key}）が定義されていない。` +
          `非継承なら binding 欠落、継承されるなら本番のリソースを共有してしまう`,
      );
      continue;
    }

    const prodIds = new Set(prod.flatMap(ids).filter((v) => v !== undefined && v !== null));
    for (const b of stageBindings) {
      const shared = ids(b).filter((v) => v !== undefined && v !== null && prodIds.has(v));
      if (shared.length > 0) {
        problems.push(`[env.stage] の ${label} が本番と同じ実体を指している: ${shared.join(", ")}`);
      }
    }
  }

  // 5. 公開オリジンが routes と整合しているか
  const vars = (stage.vars ?? {}) as Record<string, unknown>;
  const appHost = hostOf(vars.APP_ORIGIN);
  const viewHost = hostOf(vars.VIEW_ORIGIN);
  if (appHost !== EXPECTED_STAGE_APP_HOST) {
    problems.push(`[env.stage].vars.APP_ORIGIN のホストが ${EXPECTED_STAGE_APP_HOST} でない（実際: ${appHost}）`);
  }
  if (viewHost !== EXPECTED_STAGE_VIEW_HOST) {
    problems.push(`[env.stage].vars.VIEW_ORIGIN のホストが ${EXPECTED_STAGE_VIEW_HOST} でない（実際: ${viewHost}）`);
  }

  // 6. stage を workers.dev / preview URL に露出させていないか
  if (stage.workers_dev !== false) problems.push("[env.stage].workers_dev = false が明示されていない");
  if (stage.preview_urls !== false) problems.push("[env.stage].preview_urls = false が明示されていない");

  return problems;
}

// CLI: deploy 前のゲートとして使う（問題があれば非ゼロで終了）
if (import.meta.main) {
  const mod = await import("../deploy/cloudflare/wrangler.toml");
  const problems = checkStageConfig((mod as { default?: unknown }).default ?? mod);

  if (problems.length > 0) {
    console.error("[check-stage-config] stage 設定に問題があります:");
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\ndeploy を中止します。");
    process.exit(1);
  }

  console.log("[check-stage-config] OK — stage は本番から分離されています");
  console.log(`  app  : ${EXPECTED_STAGE_APP_HOST}`);
  console.log(`  view : ${EXPECTED_STAGE_VIEW_HOST}`);
}
