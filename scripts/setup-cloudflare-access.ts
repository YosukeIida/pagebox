// Cloudflare Access アプリケーション・ポリシーを API で構築するスクリプト。
//
// 使い方:
//   bun run scripts/setup-cloudflare-access.ts --env production
//   bun run scripts/setup-cloudflare-access.ts --env stage
//
// **--env は必須**。既定値を持たせると引数を打ち間違えたときに本番設定で走ってしまう
// （実際 `--env=stage` を `indexOf("--env")` で拾えず production にフォールバックしていた）。
// 未知の引数もすべて拒否する。
//
// 冪等: 同じホスト名のアプリが既にあれば作成しない。ただし「存在する」で済ませず、
// ポリシーが定義どおりかまで毎回確認して直す。アプリ作成には成功しポリシー作成で
// 失敗した中途半端な状態は、再実行で自動的に修復されなければならない
// （ポリシーが 0 件の Access アプリは全員拒否になり、bypass アプリなら公開が壊れる）。
//
// 注意: 閲覧用ホスト（view.*）には **アプリを作らない**。
// Access アプリが無いホストは保護対象外＝公開になるため、それが期待動作
// （共有 URL は認証なしで開けなければならない）。本番も stage も同じ構成。

export interface AccessPolicy {
  name: string;
  decision: "allow" | "bypass";
  include: Record<string, unknown>[];
}

export interface AppSpec {
  // このアプリの aud を ACCESS_AUD に設定する
  main?: boolean;
  name: string;
  domain: string;
  path?: string;
  policy: AccessPolicy;
}

export type EnvName = "production" | "stage";

// API は path 付きアプリを "domain/path" の形で返すため、比較用に同じ形へ揃える。
// ここを domain と path で別々に比較していたため、既存アプリを検出できず
// 再実行のたびに重複作成を試みていた。
export function fullDomain(domain: string, path?: string): string {
  if (!path) return domain;
  return `${domain}${path.startsWith("/") ? path : `/${path}`}`;
}

// 引数解析。既定値を持たせず、解釈できない引数は理由付きで拒否する。
export function parseArgs(argv: string[]): { env: EnvName } | { error: string } {
  let env: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) return { error: "--env に環境名が必要です" };
      env = value;
      i++;
      continue;
    }
    if (arg.startsWith("--env=")) {
      env = arg.slice("--env=".length);
      continue;
    }
    return { error: `未知の引数: ${arg}` };
  }
  if (env === undefined) return { error: "--env が必要です（production | stage）" };
  if (env !== "production" && env !== "stage") return { error: `未知の環境: ${env}（production | stage）` };
  return { env };
}

// 環境ごとのアプリ定義を組み立てる。
// stage は adminEmails が空だと作れない（呼び出し側で検証済みの値を渡すこと）。
export function buildApps(env: EnvName, adminEmails: string[]): AppSpec[] {
  if (env === "production") {
    return [
      {
        main: true,
        name: "pagebox",
        domain: "pagebox.iodine2.net",
        policy: { name: "Allow authenticated users", decision: "allow", include: [{ everyone: {} }] },
      },
      {
        name: "pagebox-viewer",
        domain: "pagebox.iodine2.net",
        path: "/d",
        policy: { name: "Public viewer", decision: "bypass", include: [{ everyone: {} }] },
      },
    ];
  }
  // stage は検証環境なので、本番のように誰でもログインできる形にはせず管理者に限定する。
  // 空だった場合のフォールバックは置かない（誤って全員許可にしないため）。
  if (adminEmails.length === 0) throw new Error("stage には adminEmails が必要です");
  return [
    {
      main: true,
      name: "pagebox-stage",
      domain: "stage.pagebox.iodine2.net",
      policy: {
        name: "Allow admins",
        decision: "allow",
        include: adminEmails.map((email) => ({ email: { email } })),
      },
    },
  ];
}

// API から返ってくる既存ポリシー。name 以外は欠けうるものとして扱う。
export interface ExistingPolicy {
  id: string;
  name?: string;
  decision?: string;
  include?: Record<string, unknown>[];
}

export type PolicyPlan =
  | { action: "none" }
  | { action: "create"; reason: string }
  | { action: "update"; policyId: string; reason: string }
  | { action: "conflict"; reason: string };

// include は OR 条件の集合なので順序に意味がない。順序差で毎回 update が走らないよう揃える。
function normalizeInclude(include: Record<string, unknown>[] | undefined): string {
  return JSON.stringify((include ?? []).map((i) => JSON.stringify(i)).sort());
}

// 既存ポリシーと定義を突き合わせて、次に取るべき操作を決める。
//
// ポリシーが 0 件なら「アプリだけ作られて止まった」状態なので作り直す。ここを
// 「アプリがあるからスキップ」で済ませていたため、壊れた状態のまま再実行が成功していた。
//
// 想定名のポリシーが無いのに別のポリシーがある場合は触らない。人が手で入れた
// ポリシーを消したり、precedence の異なるポリシーを足して意図しない許可を作るより、
// 止めて人に見せる方が安全。
export function planPolicy(existing: ExistingPolicy[], spec: AccessPolicy): PolicyPlan {
  if (existing.length === 0) {
    return { action: "create", reason: "ポリシーが 1 件も無い（作成が途中で失敗した状態）" };
  }
  const current = existing.find((p) => p.name === spec.name);
  if (!current) {
    const names = existing.map((p) => p.name ?? p.id).join(", ");
    return { action: "conflict", reason: `"${spec.name}" が無く、別のポリシーだけがある（${names}）` };
  }
  if (current.decision !== spec.decision) {
    return {
      action: "update",
      policyId: current.id,
      reason: `decision が ${current.decision ?? "不明"} → ${spec.decision} に変わっている`,
    };
  }
  if (normalizeInclude(current.include) !== normalizeInclude(spec.include)) {
    return { action: "update", policyId: current.id, reason: "include が定義と一致しない" };
  }
  return { action: "none" };
}

interface CfResponse<T> {
  success: boolean;
  errors: unknown[];
  result: T;
  result_info?: { page: number; total_pages?: number };
}

interface AccessApp {
  id: string;
  name?: string;
  domain: string;
  aud: string;
}

function createClient(accountId: string, apiToken: string) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<CfResponse<T>> {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as CfResponse<T>;
    if (!data.success) throw new Error(`API error: ${JSON.stringify(data.errors)}`);
    return data;
  }

  return {
    async post<T>(path: string, body: unknown): Promise<T> {
      return (await call<T>("POST", path, body)).result;
    },
    async put<T>(path: string, body: unknown): Promise<T> {
      return (await call<T>("PUT", path, body)).result;
    },
    async listPolicies(appId: string): Promise<ExistingPolicy[]> {
      return (await call<ExistingPolicy[]>("GET", `/access/apps/${appId}/policies`)).result ?? [];
    },
    // 全ページを取得する。1ページしか見ないと、アプリが増えたときに既存を検出できず
    // 重複作成を試みてしまう（このスクリプトが以前踏んだのと同じ種類の失敗）。
    async listApps(): Promise<AccessApp[]> {
      const apps: AccessApp[] = [];
      for (let page = 1; ; page++) {
        const res = await call<AccessApp[]>("GET", `/access/apps?page=${page}&per_page=50`);
        apps.push(...res.result);
        const totalPages = res.result_info?.total_pages;
        // result_info が無い API 形式でも 1 ページで打ち切る（安全側）
        if (!totalPages || page >= totalPages) break;
      }
      return apps;
    },
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    console.error("使い方: bun run scripts/setup-cloudflare-access.ts --env <production|stage>");
    process.exit(1);
  }
  const env = parsed.env;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    console.error("CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN が必要です");
    process.exit(1);
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (env === "stage" && adminEmails.length === 0) {
    console.error("stage では ADMIN_EMAILS が必要です（.env.cloudflare に設定してください）");
    process.exit(1);
  }

  const cf = createClient(accountId, apiToken);
  const specs = buildApps(env, adminEmails);
  const existing = await cf.listApps();

  let mainApp: AccessApp | null = null;
  let conflicts = 0;
  for (const spec of specs) {
    const target = fullDomain(spec.domain, spec.path);
    const found = existing.find((a) => a.domain === target);

    let app: AccessApp;
    // 既存アプリでもポリシーは必ず確認する。新規作成時は当然 0 件なので、
    // 「0 件なら作る」の一本道に合流させて分岐を持たせない。
    let policies: ExistingPolicy[] = [];
    if (found) {
      app = found;
      policies = await cf.listPolicies(found.id);
      console.log(`✓ ${spec.name} は既に存在します (id: ${found.id})`);
    } else {
      app = await cf.post<AccessApp>("/access/apps", {
        name: spec.name,
        domain: spec.domain,
        ...(spec.path ? { path: spec.path } : {}),
        type: "self_hosted",
        session_duration: "24h",
      });
      console.log(`✅ ${spec.name} を作成しました (id: ${app.id}, domain: ${target})`);
    }

    const who = spec.policy.include
      .map((i) => (i.email as { email?: string } | undefined)?.email ?? "everyone")
      .join(", ");
    const body = { ...spec.policy, session_duration: "24h", precedence: 1 };
    const plan = planPolicy(policies, spec.policy);
    if (plan.action === "create") {
      await cf.post(`/access/apps/${app.id}/policies`, body);
      console.log(`  └─ ${spec.policy.decision} ポリシーを作成しました（${who}）: ${plan.reason}`);
    } else if (plan.action === "update") {
      await cf.put(`/access/apps/${app.id}/policies/${plan.policyId}`, body);
      console.log(`  └─ ${spec.policy.decision} ポリシーを更新しました（${who}）: ${plan.reason}`);
    } else if (plan.action === "conflict") {
      console.error(`  └─ ⚠️ ${plan.reason}`);
      console.error("     自動では直しません。ダッシュボードで確認してください。");
      conflicts++;
    } else {
      console.log(`  └─ ポリシーは定義どおり（${spec.policy.decision}: ${who}）`);
    }

    if (spec.main) mainApp = app;
  }

  if (!mainApp) throw new Error("main アプリが見つかりませんでした");

  console.log("\n========================================");
  console.log(`AUD タグ（${env} の ACCESS_AUD に設定する値）:`);
  console.log(`  ${mainApp.aud}`);
  console.log("========================================");

  if (env === "stage") {
    console.log("\ndeploy/cloudflare/wrangler.toml の [env.stage.vars].ACCESS_AUD に貼ってください。");
    console.log("閲覧用の view.stage.pagebox.iodine2.net には意図的にアプリを作りません（公開）。");
  } else {
    console.log("\n.env.cloudflare に以下を追加してください:");
    console.log(`ACCESS_AUD=${mainApp.aud}`);
    console.log("次のコマンドを実行してください:  make cf-secret-aud");
  }

  // 手を入れなかった差異が残っているなら成功で終わらせない
  if (conflicts > 0) {
    console.error(`\n${conflicts} 件のポリシーが定義と食い違ったままです。`);
    process.exit(1);
  }
}

// テストから import しても API を叩かないよう、直接実行時だけ走らせる
if (import.meta.main) {
  await main();
}
