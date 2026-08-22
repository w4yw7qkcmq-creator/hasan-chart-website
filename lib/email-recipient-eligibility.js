import { evaluateEmailSendPolicy, policyToEligibility, normalizePolicyEmail } from "./email-policy/evaluate.js";

export function normalizeRecipientEmail(email) {
  return normalizePolicyEmail(email);
}

export async function evaluateEmailRecipient(
  supabase,
  {
    userId = null,
    email = null,
    category,
    messageType = null,
    requireVerifiedEmail = false,
    context = {},
  } = {},
  deps = {}
) {
  const policy = await evaluateEmailSendPolicy(
    supabase,
    {
      userId,
      email,
      category,
      messageType,
      requireVerifiedEmail,
      context,
    },
    deps
  );

  return policyToEligibility(policy);
}

export { evaluateEmailSendPolicy, policyToEligibility } from "./email-policy/evaluate.js";
