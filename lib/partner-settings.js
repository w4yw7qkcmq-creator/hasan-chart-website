import {
  PARTNER_PROGRAM_SETTINGS_COLUMNS,
} from "./supabase-query-columns";

export const DEFAULT_PARTNER_PROGRAM_SETTINGS = {
  enableAutoUpgrade: true,
  enableAutoRelease: true,
  enableMonthlyBonus: true,
  enableAchievements: true,
  monthlyBonusValues: {
    silver: 100,
    gold: 300,
    platinum: 800,
    diamond: 2000,
  },
  minimumSalesForBonus: 0,
  minimumReferralsForBonus: 0,
};

function normalizeSettingsRow(row) {
  const bonusValues =
    row?.monthly_bonus_values && typeof row.monthly_bonus_values === "object"
      ? row.monthly_bonus_values
      : DEFAULT_PARTNER_PROGRAM_SETTINGS.monthlyBonusValues;

  return {
    id: row?.id || null,
    enableAutoUpgrade: row?.enable_auto_upgrade ?? DEFAULT_PARTNER_PROGRAM_SETTINGS.enableAutoUpgrade,
    enableAutoRelease: row?.enable_auto_release ?? DEFAULT_PARTNER_PROGRAM_SETTINGS.enableAutoRelease,
    enableMonthlyBonus: row?.enable_monthly_bonus ?? DEFAULT_PARTNER_PROGRAM_SETTINGS.enableMonthlyBonus,
    enableAchievements: row?.enable_achievements ?? DEFAULT_PARTNER_PROGRAM_SETTINGS.enableAchievements,
    monthlyBonusValues: {
      silver: Number(bonusValues.silver ?? 100),
      gold: Number(bonusValues.gold ?? 300),
      platinum: Number(bonusValues.platinum ?? 800),
      diamond: Number(bonusValues.diamond ?? 2000),
    },
    minimumSalesForBonus: Number(row?.minimum_sales_for_bonus ?? 0),
    minimumReferralsForBonus: Number(row?.minimum_referrals_for_bonus ?? 0),
    updatedAt: row?.updated_at || null,
  };
}

export async function loadPartnerProgramSettings(supabase) {
  const { data, error } = await supabase
    .from("partner_program_settings")
    .select(PARTNER_PROGRAM_SETTINGS_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    const { data: created, error: createError } = await supabase
      .from("partner_program_settings")
      .insert({})
      .select(PARTNER_PROGRAM_SETTINGS_COLUMNS)
      .single();

    if (createError) {
      throw createError;
    }

    return normalizeSettingsRow(created);
  }

  return normalizeSettingsRow(data);
}

export async function savePartnerProgramSettings(supabase, input = {}) {
  const current = await loadPartnerProgramSettings(supabase);
  const now = new Date().toISOString();

  const payload = {
    enable_auto_upgrade:
      input.enableAutoUpgrade ?? current.enableAutoUpgrade,
    enable_auto_release:
      input.enableAutoRelease ?? current.enableAutoRelease,
    enable_monthly_bonus:
      input.enableMonthlyBonus ?? current.enableMonthlyBonus,
    enable_achievements:
      input.enableAchievements ?? current.enableAchievements,
    monthly_bonus_values: {
      ...current.monthlyBonusValues,
      ...(input.monthlyBonusValues || {}),
    },
    minimum_sales_for_bonus:
      input.minimumSalesForBonus ?? current.minimumSalesForBonus,
    minimum_referrals_for_bonus:
      input.minimumReferralsForBonus ?? current.minimumReferralsForBonus,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("partner_program_settings")
    .update(payload)
    .eq("id", current.id)
    .select(PARTNER_PROGRAM_SETTINGS_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return normalizeSettingsRow(data);
}
