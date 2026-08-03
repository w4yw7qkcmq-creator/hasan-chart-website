import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "../../../../lib/iam/require-admin-session.js";
import { resolveIamContext } from "../../../../lib/iam/resolve-permissions.js";
import { getBootstrapState } from "../../../../lib/iam/bootstrap.js";
import { getIamFeatureFlags } from "../../../../lib/iam/feature-flags.js";
import { getSupabaseAdmin } from "../../../../lib/auth-session.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

function publicMePayload() {
  return {
    ok: true,
    isAdmin: false,
    roles: [],
    permissions: [],
  };
}

function adminMePayload(iam, bootstrap) {
  return {
    ok: true,
    isAdmin: true,
    roles: iam.roleIds || [],
    roleLabels: iam.roleLabels || [],
    primaryRoleId: iam.primaryRoleId || null,
    primaryRoleLabel: iam.primaryRoleLabel || null,
    permissions: [...(iam.permissions || [])],
    isSuperAdmin: Boolean(iam.isSuperAdmin),
    source: iam.source || null,
    featureFlags: getIamFeatureFlags(),
    bootstrap: {
      completed: Boolean(bootstrap?.completed),
      available: Boolean(bootstrap?.available),
    },
  };
}

export async function GET() {
  try {
    const auth = await requireAuthenticatedSession();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const iam = await resolveIamContext(auth.supabase, auth.user);

    if (!iam.isAdmin) {
      return NextResponse.json(publicMePayload(), {
        headers: { "Cache-Control": CACHE_NO_STORE },
      });
    }

    const supabase = getSupabaseAdmin();
    const bootstrap = await getBootstrapState(supabase);

    return NextResponse.json(adminMePayload(iam, bootstrap), {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Server error" },
      { status: 500 }
    );
  }
}
