import { getOptionalSessionUser } from "./auth-session";
import {
  buildApiErrorLogContext,
  logApiRequest,
} from "./structured-logger";
import { handleApiError } from "./api-error-handler";
import { runWithRedisRoute } from "./redis-instrumentation";
import {
  getSupabaseQueryCount,
  logDevRoutePerf,
  runWithSupabaseMetrics,
} from "./supabase-dev-metrics";

export async function getRequestActor() {
  try {
    const session = await getOptionalSessionUser();
    if (!session) return {};

    return {
      userEmail: session.email,
      userId: session.id,
    };
  } catch {
    return {};
  }
}

export async function runApiRoute(request, { route, handler }) {
  const actor = await getRequestActor();
  const logContext = buildApiErrorLogContext(request, {
    route,
    ...actor,
  });
  const startedAt = Date.now();

  const execute = async () => {
    const response = await runWithRedisRoute(route, () => handler(request, logContext));
    const responseTimeMs = Date.now() - startedAt;

    logApiRequest({
      ...logContext,
      status: response.status,
      responseTimeMs,
    });

    logDevRoutePerf({
      route,
      elapsedMs: responseTimeMs,
      supabaseQueries: getSupabaseQueryCount(),
      status: response.status,
    });

    return response;
  };

  try {
    if (process.env.NODE_ENV === "development") {
      return await runWithSupabaseMetrics(route, execute);
    }

    return await execute();
  } catch (error) {
    return handleApiError(error, 500, {
      request,
      route,
      logContext: {
        ...actor,
        responseTimeMs: Date.now() - startedAt,
      },
    });
  }
}
