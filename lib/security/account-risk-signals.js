import {
  expiresAtForSignalType,
  hashClusterSignal,
  hashDeviceSignal,
  hashEmailSignal,
  hashNetworkSignal,
  hashVisitorSignal,
  isSecuritySignalHmacConfigured,
} from "./security-signal-hash.js";

export const RISK_SIGNAL_TYPES = Object.freeze({
  NETWORK_SIGNUP: "network_signup",
  DEVICE_SIGNUP: "device_signup",
  VISITOR_SIGNUP: "visitor_signup",
  DEVICE_MULTI_ACCOUNT: "device_multi_account",
  NETWORK_CLUSTER: "network_cluster",
  DEVICE_SAME_REFERRER: "device_same_referrer",
  DEVICE_TAMPER: "device_tamper",
  SIGNUP_VELOCITY: "signup_velocity",
  PARTNER_DEVICE_SELF: "partner_device_self",
});

const SIGNAL_WEIGHTS = Object.freeze({
  [RISK_SIGNAL_TYPES.NETWORK_SIGNUP]: 5,
  [RISK_SIGNAL_TYPES.DEVICE_SIGNUP]: 10,
  [RISK_SIGNAL_TYPES.VISITOR_SIGNUP]: 3,
  [RISK_SIGNAL_TYPES.DEVICE_MULTI_ACCOUNT]: 25,
  [RISK_SIGNAL_TYPES.NETWORK_CLUSTER]: 15,
  [RISK_SIGNAL_TYPES.DEVICE_SAME_REFERRER]: 40,
  [RISK_SIGNAL_TYPES.DEVICE_TAMPER]: 20,
  [RISK_SIGNAL_TYPES.SIGNUP_VELOCITY]: 20,
  [RISK_SIGNAL_TYPES.PARTNER_DEVICE_SELF]: 60,
});

export async function upsertAccountRiskSignal(
  supabase,
  {
    userId = null,
    signalType,
    signalHash,
    riskWeight = null,
    metadata = {},
    expiresAt = null,
  }
) {
  if (!signalHash || !signalType) return { recorded: false, reason: "missing_signal" };
  if (!isSecuritySignalHmacConfigured()) {
    return { recorded: false, reason: "hmac_not_configured" };
  }

  const now = new Date().toISOString();
  const expiry = expiresAt || expiresAtForSignalType(signalType);
  const weight = Number(riskWeight ?? SIGNAL_WEIGHTS[signalType] ?? 5);

  const { data: existing, error: readError } = await supabase
    .from("account_risk_signals")
    .select("id, occurrences, metadata")
    .eq("signal_type", signalType)
    .eq("signal_hash", signalHash)
    .maybeSingle();

  if (readError) throw readError;

  if (existing?.id) {
    const priorMeta = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
    const mergedMeta = { ...priorMeta, ...metadata };
    const seenUsers = new Set(
      Array.isArray(priorMeta.distinct_user_ids) ? priorMeta.distinct_user_ids.filter(Boolean) : []
    );
    if (userId) seenUsers.add(String(userId));
    if (seenUsers.size > 0) {
      mergedMeta.distinct_user_ids = [...seenUsers].slice(0, 64);
      mergedMeta.distinct_user_count = seenUsers.size;
    }

    const { error } = await supabase
      .from("account_risk_signals")
      .update({
        user_id: userId || undefined,
        last_seen_at: now,
        occurrences: Number(existing.occurrences || 0) + 1,
        risk_weight: weight,
        expires_at: expiry,
        metadata: mergedMeta,
      })
      .eq("id", existing.id);
    if (error) throw error;
    return { recorded: true, updated: true, id: existing.id };
  }

  const insertMeta = { ...metadata };
  if (userId) {
    insertMeta.distinct_user_ids = [String(userId)];
    insertMeta.distinct_user_count = 1;
  }

  const { data, error } = await supabase
    .from("account_risk_signals")
    .insert({
      user_id: userId,
      signal_type: signalType,
      signal_hash: signalHash,
      risk_weight: weight,
      first_seen_at: now,
      last_seen_at: now,
      occurrences: 1,
      expires_at: expiry,
      metadata: insertMeta,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { recorded: true, created: true, id: data.id };
}

export async function countSignalsByHash(supabase, { signalType, signalHash, sinceIso }) {
  let query = supabase
    .from("account_risk_signals")
    .select("id", { count: "exact", head: true })
    .eq("signal_type", signalType)
    .eq("signal_hash", signalHash);

  if (sinceIso) {
    query = query.gte("last_seen_at", sinceIso);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function countDistinctUsersForSignalHash(supabase, { signalType, signalHash, sinceIso }) {
  let query = supabase
    .from("account_risk_signals")
    .select("user_id, metadata, last_seen_at")
    .eq("signal_type", signalType)
    .eq("signal_hash", signalHash);

  if (sinceIso) query = query.gte("last_seen_at", sinceIso);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  let maxMetaCount = 0;
  for (const row of rows) {
    const metaCount = Number(row.metadata?.distinct_user_count || 0);
    if (metaCount > maxMetaCount) maxMetaCount = metaCount;
  }
  const userSet = new Set(rows.map((row) => row.user_id).filter(Boolean));
  return Math.max(userSet.size, maxMetaCount);
}

export async function recordSignupRiskSignals(
  supabase,
  {
    userId,
    clientIp,
    deviceToken,
    visitorKey = null,
    partnerId = null,
    deviceTampered = false,
  }
) {
  const results = [];
  const networkHash = hashNetworkSignal(clientIp);
  const deviceHash = hashDeviceSignal(deviceToken);
  const visitorHash = visitorKey ? hashVisitorSignal(visitorKey) : null;

  if (networkHash) {
    results.push(
      await upsertAccountRiskSignal(supabase, {
        userId,
        signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
        signalHash: networkHash,
        metadata: { partnerId: partnerId || null },
      })
    );
  }

  if (deviceHash) {
    results.push(
      await upsertAccountRiskSignal(supabase, {
        userId,
        signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
        signalHash: deviceHash,
        metadata: { partnerId: partnerId || null },
      })
    );
  }

  if (visitorHash) {
    results.push(
      await upsertAccountRiskSignal(supabase, {
        userId,
        signalType: RISK_SIGNAL_TYPES.VISITOR_SIGNUP,
        signalHash: visitorHash,
        metadata: { partnerId: partnerId || null },
      })
    );
  }

  if (deviceTampered && deviceHash) {
    results.push(
      await upsertAccountRiskSignal(supabase, {
        userId,
        signalType: RISK_SIGNAL_TYPES.DEVICE_TAMPER,
        signalHash: deviceHash,
      })
    );
  }

  if (partnerId && deviceHash) {
    const clusterHash = hashClusterSignal([deviceHash, partnerId]);
    if (clusterHash) {
      results.push(
        await upsertAccountRiskSignal(supabase, {
          userId,
          signalType: RISK_SIGNAL_TYPES.DEVICE_SAME_REFERRER,
          signalHash: clusterHash,
          metadata: { partnerId },
        })
      );
    }
  }

  return results;
}

export async function computeSignupVelocityContext(supabase, { clientIp, deviceToken, partnerId }) {
  const now = Date.now();
  const windows = {
    tenMinutes: new Date(now - 10 * 60 * 1000).toISOString(),
    day: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    week: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const networkHash = hashNetworkSignal(clientIp);
  const deviceHash = hashDeviceSignal(deviceToken);
  const partnerClusterHash =
    partnerId && networkHash ? hashClusterSignal([networkHash, partnerId]) : null;

  const [
    network10m,
    network24h,
    network7d,
    deviceAccounts24h,
    deviceAccounts7d,
    partnerNetwork24h,
  ] = await Promise.all([
    networkHash
      ? countSignalsByHash(supabase, {
          signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
          signalHash: networkHash,
          sinceIso: windows.tenMinutes,
        })
      : 0,
    networkHash
      ? countDistinctUsersForSignalHash(supabase, {
          signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
          signalHash: networkHash,
          sinceIso: windows.day,
        })
      : 0,
    networkHash
      ? countDistinctUsersForSignalHash(supabase, {
          signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
          signalHash: networkHash,
          sinceIso: windows.week,
        })
      : 0,
    deviceHash
      ? countDistinctUsersForSignalHash(supabase, {
          signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
          signalHash: deviceHash,
          sinceIso: windows.day,
        })
      : 0,
    deviceHash
      ? countDistinctUsersForSignalHash(supabase, {
          signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
          signalHash: deviceHash,
          sinceIso: windows.week,
        })
      : 0,
    partnerClusterHash
      ? countDistinctUsersForSignalHash(supabase, {
          signalType: RISK_SIGNAL_TYPES.DEVICE_SAME_REFERRER,
          signalHash: partnerClusterHash,
          sinceIso: windows.day,
        })
      : 0,
  ]);

  return {
    recentSignupCount: network10m,
    recentNetworkSignupCount: network24h,
    networkSignup7d: network7d,
    deviceAccountCount24h: deviceAccounts24h,
    deviceAccountCount7d: deviceAccounts7d,
    partnerNetworkSignup24h: partnerNetwork24h,
    sharedNetworkOnly: network24h >= 2 && deviceAccounts24h <= 1,
  };
}

export async function loadUserRiskSignalSummary(supabase, userId) {
  const { data, error } = await supabase
    .from("account_risk_signals")
    .select("signal_type, signal_hash, occurrences, last_seen_at, risk_weight, metadata")
    .eq("user_id", userId)
    .gte("expires_at", new Date().toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const deviceAccounts = new Set();
  const networkAccounts = new Set();

  for (const row of data || []) {
    if (row.signal_type === RISK_SIGNAL_TYPES.DEVICE_SIGNUP) {
      deviceAccounts.add(row.signal_hash);
    }
    if (row.signal_type === RISK_SIGNAL_TYPES.NETWORK_SIGNUP) {
      networkAccounts.add(row.signal_hash);
    }
  }

  return {
    signals: data || [],
    deviceClusterCount: deviceAccounts.size,
    networkClusterCount: networkAccounts.size,
  };
}

export { hashEmailSignal };
