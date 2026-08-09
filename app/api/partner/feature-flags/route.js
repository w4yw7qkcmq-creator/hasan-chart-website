import { getPartnerCenterFeatureFlags } from "../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ success: true, flags: getPartnerCenterFeatureFlags() });
}
