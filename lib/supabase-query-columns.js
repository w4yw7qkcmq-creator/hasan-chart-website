export const NOTIFICATION_LIST_COLUMNS =
  "id,user_email,title,message,type,notification_key,metadata,is_read,is_pinned,created_at,url";

export const NOTIFICATION_HUB_FEED_COLUMNS = NOTIFICATION_LIST_COLUMNS;

export const USER_NOTIFICATION_SETTINGS_COLUMNS =
  "user_id,sound_enabled,sound_volume,price_alert_sound_enabled,vip_signal_sound_enabled,breaking_news_sound_enabled,admin_sound_enabled,default_sound_enabled,sound_preferences,created_at,updated_at";

export const NOTIFICATION_COUNT_COLUMN = "id";

export const DAILY_ANALYSIS_COLUMNS =
  "id,title,symbol,direction,analysis_type,content,notes,created_by,created_at,published";

export const VIP_SIGNALS_DEFAULT_LIMIT = 20;
export const VIP_SIGNALS_MAX_LIMIT = 50;

export const VIP_SIGNALS_LIST_COLUMNS =
  "id,signal_type,coin,entry,targets,stop_loss,notes,status,created_at";

/** Lightweight list/card projection — no full article body. */
export const NEWS_CARD_COLUMNS =
  "id,slug,title,image_url,impact_level,source_link,created_at";

export const NEWS_LIST_COLUMNS = NEWS_CARD_COLUMNS;

export const NEWS_RELATED_COLUMNS = NEWS_CARD_COLUMNS;

/** Full article for detail pages only. */
export const NEWS_DETAIL_COLUMNS =
  "id,slug,title,content,image_url,impact_level,source_link,created_at";

/** @deprecated Use NEWS_DETAIL_COLUMNS */
export const NEWS_ARTICLE_COLUMNS = NEWS_DETAIL_COLUMNS;

/** News worker duplicate-detection on published_news. */
export const PUBLISHED_NEWS_WORKER_COLUMNS =
  "link,title,normalized_title,topic_cluster,published_at,created_at";

export const PARTNER_DASHBOARD_COLUMNS =
  "id,user_id,referral_code,status,tier_key,tier,visit_count,signup_count,active_account_count,balance_withdrawable,balance_pending,balance_bonus_pending,total_earnings,total_withdrawn,vip_signal_count,vip_spot_count,account_management_service_count,academy_count,created_at,updated_at";

export const PARTNER_ADMIN_DETAIL_COLUMNS =
  "id,user_id,referral_code,tier_key,tier,status,visit_count,signup_count,active_account_count,balance_withdrawable,balance_pending,balance_bonus_pending,total_earnings,total_withdrawn,created_at,updated_at";

export const PARTNER_REFERRAL_COLUMNS =
  "id,partner_id,referral_code,referred_username,referred_user_id,status,registered_at,activated_at,created_at";

export const PARTNER_COMMISSION_COLUMNS =
  "id,partner_id,user_id,subscription_id,source_id,source_type,source_ref,amount,currency,status,is_withdrawable,description,reason,invited_username,service_type,commission_percent,base_amount,created_at";

export const PARTNER_WITHDRAWAL_COLUMNS =
  "id,partner_id,amount,currency,network,wallet_address,status,admin_note,partner_note,payment_proof,created_at,paid_at,approved_at,rejected_at,updated_at";

export const PARTNER_CAMPAIGN_COLUMNS =
  "id,partner_id,name,slug,utm_source,utm_medium,utm_campaign,visit_count,signup_count,is_active,created_at";

export const PARTNER_LEDGER_COLUMNS =
  "id,partner_id,type,amount,balance_before,balance_after,reference_type,reference_id,note,created_at";

export const PARTNER_NOTIFICATION_INSERT_COLUMNS =
  "id,partner_id,user_id,type,title,body,payload,read_at,created_at";

export const PARTNER_PROGRAM_SETTINGS_COLUMNS =
  "id,enable_auto_upgrade,enable_auto_release,enable_monthly_bonus,enable_achievements,monthly_bonus_values,minimum_sales_for_bonus,minimum_referrals_for_bonus,updated_at,created_at";

export const PARTNER_ACHIEVEMENT_DEFINITION_COLUMNS =
  "achievement_key,title,description,badge_label,badge_icon,sort_order,is_active";

export const PARTNER_USER_ACHIEVEMENT_COLUMNS =
  "partner_id,achievement_key,unlocked_at,metadata";

export const EMAIL_MESSAGE_COLUMNS =
  "id,resend_id,recipient_email,subject,message_type,status,sent_at,created_at,delivered_at,failed_at,bounced_at,complained_at,opened,clicked,open_count,click_count,device,country,ip_address,opened_at,clicked_at,last_event_at,updated_at";

export const EMAIL_ANALYTICS_EVENT_COLUMNS =
  "id,event_type,created_at,payload,resend_id,recipient_email,message_type";
