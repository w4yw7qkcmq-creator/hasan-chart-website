import { REWARD_MAX, REWARD_MIN } from "./phase2-constants.js";

const REWARD_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function validateMissionRewardAmount(amount) {
  if (amount == null || amount === "") {
    return { ok: false, error: "missing_reward_amount" };
  }

  const raw = String(amount).trim();
  if (!REWARD_AMOUNT_PATTERN.test(raw)) {
    return { ok: false, error: "invalid_reward_format" };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, error: "invalid_reward_format" };
  }
  if (value < REWARD_MIN) {
    return { ok: false, error: "reward_below_minimum", min: REWARD_MIN };
  }
  if (value > REWARD_MAX) {
    return { ok: false, error: "reward_above_maximum", max: REWARD_MAX };
  }

  return { ok: true, amount: value };
}
