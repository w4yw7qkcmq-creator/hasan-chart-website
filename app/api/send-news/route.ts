import { requireMachineOrAdminPermission } from "../../../lib/iam/machine-auth.js";
import { IAM_PERMISSIONS } from "../../../lib/iam/constants.js";
import { handleManualSendNewsRequest } from "../../../lib/news-intelligence/manual-publish.js";

export async function POST(req: Request) {
  try {
    const authCheck = await requireMachineOrAdminPermission(req, IAM_PERMISSIONS.NEWS_PUBLISH);

    if (!authCheck.ok) {
      return Response.json(
        {
          success: false,
          error: authCheck.error,
        },
        { status: authCheck.status }
      );
    }

    const body = await req.json();

    const gatewayResult = await handleManualSendNewsRequest(body, {
      runtimeMode: body?.dryRun === true ? "test" : undefined,
    });

    if (gatewayResult.blocked) {
      return Response.json(
        {
          success: false,
          blocked: true,
          reason: gatewayResult.reason,
          stage: gatewayResult.stage,
          eventKey: gatewayResult.eventKey,
          authMode: authCheck.authMode || (authCheck.user ? "admin" : "unknown"),
        },
        { status: 403 }
      );
    }

    if (!gatewayResult.success) {
      return Response.json(
        {
          success: false,
          error: gatewayResult.error || "publication_failed",
          authMode: authCheck.authMode || (authCheck.user ? "admin" : "unknown"),
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      dryRun: gatewayResult.dryRun === true,
      eventKey: gatewayResult.eventKey,
      published: gatewayResult.published === true,
      authMode: authCheck.authMode || (authCheck.user ? "admin" : "unknown"),
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
    });
  }
}
