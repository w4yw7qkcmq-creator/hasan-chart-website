import { hashClusterSignal, hashDeviceSignal, hashEmailSignal } from "../security/security-signal-hash.js";
import { countDistinctUsersForSignalHash, RISK_SIGNAL_TYPES } from "../security/account-risk-signals.js";

export const IDENTITY_CERTAINTY = Object.freeze({
  NONE: "none",
  PROBABLE: "probable",
  CONFIRMED: "confirmed",
  AMBIGUOUS: "ambiguous",
});

export async function evaluateDuplicateIdentityRisk(
  supabase,
  {
    referredUserId,
    partnerUserId = null,
    email = null,
    deviceToken = null,
    clientIp = null,
  }
) {
  const reasons = [];
  let certainty = IDENTITY_CERTAINTY.NONE;
  let duplicateIdentity = false;
  let selfReferralDevice = false;

  if (partnerUserId && referredUserId && String(partnerUserId) === String(referredUserId)) {
    return {
      duplicateIdentity: true,
      certainty: IDENTITY_CERTAINTY.CONFIRMED,
      selfReferral: true,
      selfReferralDevice: false,
      reasons: ["self_referral_user_id"],
    };
  }

  const deviceHash = deviceToken ? hashDeviceSignal(deviceToken) : null;
  const emailHash = email ? hashEmailSignal(email) : null;

  if (deviceHash) {
    const deviceUsers = await countDistinctUsersForSignalHash(supabase, {
      signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
      signalHash: deviceHash,
    });
    if (deviceUsers >= 2) {
      duplicateIdentity = true;
      certainty = IDENTITY_CERTAINTY.PROBABLE;
      reasons.push("same_device_multiple_accounts");
    }
    if (partnerUserId) {
      const partnerDeviceCluster = hashClusterSignal([deviceHash, partnerUserId]);
      const partnerDeviceUsers = partnerDeviceCluster
        ? await countDistinctUsersForSignalHash(supabase, {
            signalType: RISK_SIGNAL_TYPES.DEVICE_SAME_REFERRER,
            signalHash: partnerDeviceCluster,
          })
        : 0;
      if (partnerDeviceUsers >= 1) {
        selfReferralDevice = true;
        duplicateIdentity = true;
        certainty = IDENTITY_CERTAINTY.CONFIRMED;
        reasons.push("same_device_partner_referrer");
      }
    }
  }

  if (emailHash) {
    const emailUsers = await countDistinctUsersForSignalHash(supabase, {
      signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
      signalHash: hashClusterSignal([emailHash]) || emailHash,
    }).catch(() => 0);
    if (emailUsers >= 2) {
      reasons.push("email_pattern_cluster");
      if (certainty === IDENTITY_CERTAINTY.NONE) {
        certainty = IDENTITY_CERTAINTY.AMBIGUOUS;
      }
    }
  }

  if (clientIp && deviceHash) {
    const networkOnly = await countDistinctUsersForSignalHash(supabase, {
      signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
      signalHash: hashClusterSignal([clientIp]) || "",
    }).catch(() => 0);
    if (networkOnly >= 3 && !duplicateIdentity) {
      reasons.push("shared_network_only");
      certainty = IDENTITY_CERTAINTY.AMBIGUOUS;
    }
  }

  return {
    duplicateIdentity,
    certainty,
    selfReferral: false,
    selfReferralDevice,
    reasons,
  };
}
