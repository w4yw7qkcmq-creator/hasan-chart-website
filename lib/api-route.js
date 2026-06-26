import { getOptionalSessionUser } from "./auth-session";
import {
  buildApiErrorLogContext,
  logApiRequest,
} from "./structured-logger";
import { jsonError } from "./api-response";

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

  try {
    const response = await handler(request, logContext);
    logApiRequest({
      ...logContext,
      status: response.status,
      responseTimeMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    return jsonError(error, 500, {
      logContext: {
        ...logContext,
        responseTimeMs: Date.now() - startedAt,
        forceLog: true,
      },
    });
  }
}
