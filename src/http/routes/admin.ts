import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { AuthContext } from "../../ports/auth";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { Layout } from "../web/layout";
import { DashboardPage } from "../web/dashboard";
import type { AnalyticsData, LoginEntry, SystemData } from "../web/dashboard";

type Vars = { Variables: { authContext: AuthContext } };

async function fetchAnalyticsData(cfApiToken: string, cfAccountId: string): Promise<AnalyticsData | null> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const query = `
      SELECT blob2 AS slug,
        blob3 AS country,
        blob4 AS referer,
        SUM(_sample_interval) AS view_count
      FROM pagebox_events
      WHERE blob1 = 'view'
        AND timestamp > toDateTime('${thirtyDaysAgo}')
      GROUP BY slug, country, referer
      ORDER BY view_count DESC
      LIMIT 200
    `;
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          "Content-Type": "text/plain",
        },
        body: query,
      },
    );
    if (!res.ok) return null;
    const json = await res.json() as { data?: { slug: string; country: string; referer: string; view_count: number }[] };
    const rows = json.data ?? [];

    // ドキュメント別集計
    const slugMap = new Map<string, number>();
    const countryMap = new Map<string, number>();
    const refererMap = new Map<string, number>();
    for (const r of rows) {
      slugMap.set(r.slug, (slugMap.get(r.slug) ?? 0) + Number(r.view_count));
      if (r.country) countryMap.set(r.country, (countryMap.get(r.country) ?? 0) + Number(r.view_count));
      if (r.referer) refererMap.set(r.referer, (refererMap.get(r.referer) ?? 0) + Number(r.view_count));
    }

    return {
      topDocuments: [...slugMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([slug, viewCount]) => ({ slug, viewCount })),
      topCountries: [...countryMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([country, viewCount]) => ({ country, viewCount })),
      topReferers: [...refererMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([referer, viewCount]) => ({ referer, viewCount })),
      dailyViews: [],
    };
  } catch {
    return null;
  }
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
          limit: 168
          filter: {
            datetime_geq: "${sevenDaysAgo}"
            datetime_lt: "${now}"
            scriptName: "pagebox"
          }
          orderBy: [datetime_ASC]
        ) {
          sum { requests errors }
          quantiles { cpuTimeUs { p50 p99 } }
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
              quantiles?: { cpuTimeUs?: { p50: number; p99: number } };
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
    const lastCpu = workerRows[workerRows.length - 1]?.quantiles?.cpuTimeUs;

    const d1ReadQueries = account.d1AnalyticsAdaptiveGroups?.[0]?.sum?.readQueries ?? 0;
    const r2StorageBytes = account.r2StorageAdaptiveGroups?.[0]?.max?.payloadSize ?? 0;

    return {
      requestsLast7d: totalRequests,
      errorsLast7d: totalErrors,
      cpuP50Ms: lastCpu ? lastCpu.p50 / 1000 : null,
      cpuP99Ms: lastCpu ? lastCpu.p99 / 1000 : null,
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
