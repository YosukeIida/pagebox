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
// 冪等: 同じホスト名のアプリが既にあれば作成せず AUD だけ表示する。
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
  for (const spec of specs) {
    const target = fullDomain(spec.domain, spec.path);
    const found = existing.find((a) => a.domain === target);
    if (found) {
      console.log(`✓ ${spec.name} は既に存在します (id: ${found.id})`);
      if (spec.main) mainApp = found;
      continue;
    }
    const app = await cf.post<AccessApp>("/access/apps", {
      name: spec.name,
      domain: spec.domain,
      ...(spec.path ? { path: spec.path } : {}),
      type: "self_hosted",
      session_duration: "24h",
    });
    console.log(`✅ ${spec.name} を作成しました (id: ${app.id}, domain: ${target})`);
    await cf.post(`/access/apps/${app.id}/policies`, { ...spec.policy, session_duration: "24h", precedence: 1 });
    const who = spec.policy.include
      .map((i) => (i.email as { email?: string } | undefined)?.email ?? "everyone")
      .join(", ");
    console.log(`  └─ ${spec.policy.decision} ポリシーを追加しました（${who}）`);
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
}

// テストから import しても API を叩かないよう、直接実行時だけ走らせる
if (import.meta.main) {
  await main();
}
