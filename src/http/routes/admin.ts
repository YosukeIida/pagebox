import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { AuthContext } from "../../ports/auth";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { Layout } from "../web/layout";
import { DashboardPage } from "../web/dashboard";
import type { AnalyticsData, LoginEntry, SystemData } from "../web/dashboard";

type Vars = { Variables: { authContext: AuthContext } };

async function sqlQuery(
  cfApiToken: string,
  cfAccountId: string,
  query: string,
): Promise<{ data?: Record<string, unknown>[] } | null> {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/analytics_engine/sql`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfApiToken}`, "Content-Type": "text/plain" },
        body: query,
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<{ data?: Record<string, unknown>[] }>;
  } catch {
    return null;
  }
}

async function fetchAnalyticsData(cfApiToken: string, cfAccountId: string): Promise<AnalyticsData | null> {
  const BASE = `FROM pagebox_events WHERE blob1 = 'view' AND timestamp > now() - interval '30' day`;

  // ランキングごとに独立した SQL で正確に集計（JS 側での再集計を排除）
  const [docsJson, countriesJson, referersJson, totalJson] = await Promise.all([
    sqlQuery(cfApiToken, cfAccountId, `SELECT blob2 AS slug, SUM(_sample_interval) AS view_count ${BASE} GROUP BY slug ORDER BY view_count DESC LIMIT 10`),
    sqlQuery(cfApiToken, cfAccountId, `SELECT blob3 AS country, SUM(_sample_interval) AS view_count ${BASE} GROUP BY country ORDER BY view_count DESC LIMIT 10`),
    sqlQuery(cfApiToken, cfAccountId, `SELECT blob4 AS referer, SUM(_sample_interval) AS view_count ${BASE} GROUP BY referer ORDER BY view_count DESC LIMIT 10`),
    sqlQuery(cfApiToken, cfAccountId, `SELECT SUM(_sample_interval) AS total_views ${BASE}`),
  ]);

  if (!docsJson) return null;

  return {
    topDocuments: (docsJson.data ?? []).map((r) => ({ slug: String(r.slug ?? ""), viewCount: Number(r.view_count ?? 0) })).filter((r) => r.slug),
    topCountries: (countriesJson?.data ?? []).map((r) => ({ country: String(r.country ?? ""), viewCount: Number(r.view_count ?? 0) })).filter((r) => r.country),
    topReferers: (referersJson?.data ?? []).map((r) => ({ referer: String(r.referer ?? ""), viewCount: Number(r.view_count ?? 0) })).filter((r) => r.referer),
    totalViews: Number(totalJson?.data?.[0]?.total_views ?? 0),
    dailyViews: [],
  };
}

async function fetchLoginHistory(cfApiToken: string, cfAccountId: string): Promise<LoginEntry[] | null> {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/access/logs/access_requests?limit=50`,
      { headers: { Authorization: `Bearer ${cfApiToken}` } },
    );
    if (!res.ok) return null;
    const json = await res.json() as {
      success: boolean;
      result?: {
        user_email?: string;
        ip_address?: string;
        created_at?: string;
        allowed?: boolean;
        app_domain?: string;
      }[];
    };
    if (!json.success || !json.result) return null;
    return json.result.map((r) => ({
      userEmail: r.user_email ?? "",
      ipAddress: r.ip_address ?? "",
      createdAt: r.created_at ?? "",
      allowed: r.allowed ?? false,
      appDomain: r.app_domain ?? "",
    }));
  } catch {
    return null;
  }
}

async function fetchSystemData(cfApiToken: string, cfAccountId: string): Promise<SystemData | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const workersQuery = `{
    viewer {
      accounts(filter: {accountTag: "${cfAccountId}"}) {
        workersInvocationsAdaptive(
          limit: 1
          filter: {
            datetime_geq: "${sevenDaysAgo}"
            datetime_lt: "${now}"
            scriptName: "pagebox"
          }
        ) {
          sum { requests errors }
          quantiles { cpuTimeP50 cpuTimeP99 }
        }
        d1AnalyticsAdaptiveGroups(
          limit: 1
          filter: {
            datetime_geq: "${sevenDaysAgo}"
            datetime_lt: "${now}"
          }
        ) {
          sum { readQueries }
        }
        r2StorageAdaptiveGroups(
          limit: 1
          filter: {
            datetime_geq: "${sevenDaysAgo}"
            datetime_lt: "${now}"
            bucketName: "pagebox-blobs"
          }
          orderBy: [datetime_DESC]
        ) {
          max { payloadSize }
        }
      }
    }
  }`;

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: workersQuery }),
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      data?: {
        viewer?: {
          accounts?: {
            workersInvocationsAdaptive?: {
              sum: { requests: number; errors: number };
              quantiles?: { cpuTimeP50?: number; cpuTimeP99?: number };
            }[];
            d1AnalyticsAdaptiveGroups?: { sum: { readQueries: number } }[];
            r2StorageAdaptiveGroups?: { max: { payloadSize: number } }[];
          }[];
        };
      };
    };

    const account = json.data?.viewer?.accounts?.[0];
    if (!account) return null;

    const workerRows = account.workersInvocationsAdaptive ?? [];
    const totalRequests = workerRows.reduce((s, r) => s + (r.sum?.requests ?? 0), 0);
    const totalErrors = workerRows.reduce((s, r) => s + (r.sum?.errors ?? 0), 0);
    const lastCpu = workerRows[workerRows.length - 1]?.quantiles;

    const d1ReadQueries = account.d1AnalyticsAdaptiveGroups?.[0]?.sum?.readQueries ?? 0;
    const r2StorageBytes = account.r2StorageAdaptiveGroups?.[0]?.max?.payloadSize ?? 0;

    return {
      requestsLast7d: totalRequests,
      errorsLast7d: totalErrors,
      cpuP50Ms: lastCpu?.cpuTimeP50 != null ? lastCpu.cpuTimeP50 / 1000 : null,
      cpuP99Ms: lastCpu?.cpuTimeP99 != null ? lastCpu.cpuTimeP99 / 1000 : null,
      d1ReadQueries,
      r2StorageBytes,
    };
  } catch {
    return null;
  }
}

export function adminRoutes(deps: AppDeps): Hono {
  const app = new Hono<Vars>();

  app.use("/*", requireAuth(deps) as any);
  app.use("/*", requireAdmin(deps) as any);

  app.get("/", async (c) => {
    const { email } = c.get("authContext");

    const stats = deps.adminRepo
      ? await deps.adminRepo.getStats()
      : { userStats: [], recentDocs: [], totalDocCount: 0, totalSize: 0 };

    const hasCfCreds = Boolean(deps.cfApiToken && deps.cfAccountId);
    const [analytics, logins, system] = hasCfCreds
      ? await Promise.all([
          fetchAnalyticsData(deps.cfApiToken!, deps.cfAccountId!),
          fetchLoginHistory(deps.cfApiToken!, deps.cfAccountId!),
          fetchSystemData(deps.cfApiToken!, deps.cfAccountId!),
        ])
      : [null, null, null];

    const content = DashboardPage({ email, stats, analytics, logins, system });
    const page = Layout({ title: "pagebox admin", children: content });
    return c.html(page as unknown as string);
  });

  return app as unknown as Hono;
}
