import { verifyCronSecret } from "../../../../lib/admin-auth";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { runTelegramAlbumRecoverySweep } from "../../../../lib/telegram-content/album-liveness-scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ success: false, error: "Database unavailable." }, { status: 503 });
  }

  const result = await runTelegramAlbumRecoverySweep({ supabase, forceCleanup: true });
  return Response.json({ success: true, result });
}
