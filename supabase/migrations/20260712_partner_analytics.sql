-- Partner Analytics & Leaderboards — Phase 8

CREATE OR REPLACE FUNCTION public.partner_analytics_summary(p_partner_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH referral_stats AS (
    SELECT
      COUNT(*)::bigint AS total_referrals,
      COUNT(*) FILTER (WHERE status = 'active')::bigint AS active_referrals,
      COUNT(*) FILTER (WHERE status <> 'active')::bigint AS inactive_referrals
    FROM partner_referrals
    WHERE partner_id = p_partner_id
  ),
  commission_stats AS (
    SELECT
      COUNT(*) FILTER (
        WHERE service_type IN ('vip_signal', 'vip_spot', 'vip_futures', 'subscription')
      )::bigint AS total_subscriptions,
      COUNT(*) FILTER (WHERE service_type = 'account_management')::bigint AS account_management_count,
      COUNT(*) FILTER (WHERE service_type = 'vip_spot')::bigint AS vip_spot_count,
      COUNT(*) FILTER (WHERE service_type = 'vip_futures')::bigint AS vip_futures_count,
      COUNT(*) FILTER (WHERE service_type = 'academy')::bigint AS academy_count,
      COALESCE(SUM(base_amount) FILTER (
        WHERE service_type <> 'registration'
          AND status IN ('approved', 'withdrawable', 'paid')
      ), 0)::numeric(12, 2) AS total_sales,
      COALESCE(SUM(amount) FILTER (
        WHERE status IN ('approved', 'withdrawable', 'paid', 'pending', 'pending_activation')
      ), 0)::numeric(12, 2) AS total_commissions
    FROM partner_commissions
    WHERE partner_id = p_partner_id
  ),
  partner_row AS (
    SELECT
      visit_count,
      signup_count,
      active_account_count,
      balance_pending,
      balance_withdrawable,
      balance_bonus_pending,
      total_earnings,
      total_withdrawn
    FROM partners
    WHERE id = p_partner_id
  )
  SELECT jsonb_build_object(
    'totalReferrals', r.total_referrals,
    'activeReferrals', r.active_referrals,
    'inactiveReferrals', r.inactive_referrals,
    'totalSubscriptions', c.total_subscriptions,
    'accountManagementCount', c.account_management_count,
    'vipSpotCount', c.vip_spot_count,
    'vipFuturesCount', c.vip_futures_count,
    'academyCount', c.academy_count,
    'totalSales', c.total_sales,
    'totalCommissions', c.total_commissions,
    'balancePending', p.balance_pending,
    'balanceWithdrawable', p.balance_withdrawable,
    'balanceBonusPending', p.balance_bonus_pending,
    'totalEarnings', p.total_earnings,
    'totalWithdrawn', p.total_withdrawn,
    'visitCount', p.visit_count,
    'signupCount', p.signup_count,
    'activeAccountCount', p.active_account_count,
    'conversionRate', CASE
      WHEN p.signup_count > 0 THEN ROUND((r.active_referrals::numeric / p.signup_count) * 100, 2)
      ELSE 0
    END,
    'averageCustomerValue', CASE
      WHEN r.active_referrals > 0 THEN ROUND(c.total_sales / r.active_referrals, 2)
      ELSE 0
    END,
    'averageCommissionPerCustomer', CASE
      WHEN r.active_referrals > 0 THEN ROUND(c.total_commissions / r.active_referrals, 2)
      ELSE 0
    END
  )
  FROM referral_stats r
  CROSS JOIN commission_stats c
  CROSS JOIN partner_row p;
$$;

CREATE OR REPLACE FUNCTION public.partner_analytics_charts(p_partner_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH daily_commissions AS (
    SELECT
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day_key,
      COALESCE(SUM(amount), 0)::numeric(12, 2) AS total_amount
    FROM partner_commissions
    WHERE partner_id = p_partner_id
      AND created_at >= (now() - interval '30 days')
      AND status IN ('approved', 'withdrawable', 'paid', 'pending', 'pending_activation')
    GROUP BY 1
    ORDER BY 1
  ),
  monthly_sales AS (
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_key,
      COALESCE(SUM(base_amount), 0)::numeric(12, 2) AS total_sales
    FROM partner_commissions
    WHERE partner_id = p_partner_id
      AND service_type <> 'registration'
      AND status IN ('approved', 'withdrawable', 'paid')
      AND created_at >= (now() - interval '12 months')
    GROUP BY 1
    ORDER BY 1
  ),
  monthly_new_customers AS (
    SELECT
      to_char(date_trunc('month', registered_at), 'YYYY-MM') AS month_key,
      COUNT(*)::bigint AS new_customers
    FROM partner_referrals
    WHERE partner_id = p_partner_id
      AND registered_at >= (now() - interval '12 months')
    GROUP BY 1
    ORDER BY 1
  ),
  monthly_commissions AS (
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_key,
      COALESCE(SUM(amount), 0)::numeric(12, 2) AS total_commissions
    FROM partner_commissions
    WHERE partner_id = p_partner_id
      AND created_at >= (now() - interval '12 months')
      AND status IN ('approved', 'withdrawable', 'paid', 'pending', 'pending_activation')
    GROUP BY 1
    ORDER BY 1
  ),
  earnings_by_service AS (
    SELECT
      COALESCE(service_type, 'unknown') AS service_type,
      COALESCE(SUM(amount), 0)::numeric(12, 2) AS total_amount
    FROM partner_commissions
    WHERE partner_id = p_partner_id
      AND status IN ('approved', 'withdrawable', 'paid', 'pending', 'pending_activation')
    GROUP BY 1
    ORDER BY 2 DESC
  )
  SELECT jsonb_build_object(
    'commissionsLast30Days', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', day_key, 'amount', total_amount)) FROM daily_commissions), '[]'::jsonb),
    'monthlySales', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month_key, 'amount', total_sales)) FROM monthly_sales), '[]'::jsonb),
    'monthlyNewCustomers', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month_key, 'count', new_customers)) FROM monthly_new_customers), '[]'::jsonb),
    'monthlyComparison', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'month', COALESCE(s.month_key, c.month_key, n.month_key),
          'sales', COALESCE(s.total_sales, 0),
          'commissions', COALESCE(c.total_commissions, 0),
          'newCustomers', COALESCE(n.new_customers, 0)
        )
        ORDER BY COALESCE(s.month_key, c.month_key, n.month_key)
      )
      FROM monthly_sales s
      FULL OUTER JOIN monthly_commissions c ON c.month_key = s.month_key
      FULL OUTER JOIN monthly_new_customers n ON n.month_key = COALESCE(s.month_key, c.month_key)
    ), '[]'::jsonb),
    'earningsByService', COALESCE((SELECT jsonb_agg(jsonb_build_object('serviceType', service_type, 'amount', total_amount)) FROM earnings_by_service), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.partner_top_referrals(p_partner_id uuid, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH referral_base AS (
    SELECT
      pr.referred_user_id,
      pr.referred_username,
      pr.registered_at,
      pr.status,
      pr.activated_at
    FROM partner_referrals pr
    WHERE pr.partner_id = p_partner_id
  ),
  commission_agg AS (
    SELECT
      pc.user_id,
      COALESCE(SUM(pc.base_amount) FILTER (
        WHERE pc.service_type <> 'registration'
          AND pc.status IN ('approved', 'withdrawable', 'paid')
      ), 0)::numeric(12, 2) AS total_sales,
      COALESCE(SUM(pc.amount) FILTER (
        WHERE pc.status IN ('approved', 'withdrawable', 'paid', 'pending', 'pending_activation')
      ), 0)::numeric(12, 2) AS total_commissions,
      MAX(pc.created_at) AS last_commission_at,
      (
        SELECT pc2.service_type
        FROM partner_commissions pc2
        WHERE pc2.partner_id = p_partner_id
          AND pc2.user_id = pc.user_id
          AND pc2.service_type <> 'registration'
        GROUP BY pc2.service_type
        ORDER BY SUM(pc2.base_amount) DESC NULLS LAST
        LIMIT 1
      ) AS primary_service
    FROM partner_commissions pc
    WHERE pc.partner_id = p_partner_id
      AND pc.user_id IS NOT NULL
    GROUP BY pc.user_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."totalSales" DESC, t."registeredAt" DESC), '[]'::jsonb)
  FROM (
    SELECT
      rb.referred_user_id AS "userId",
      rb.referred_username AS username,
      p.email,
      COALESCE(ca.primary_service, 'registration') AS "primaryService",
      COALESCE(ca.total_sales, 0) AS "totalSales",
      COALESCE(ca.total_commissions, 0) AS "totalCommissions",
      rb.registered_at AS "registeredAt",
      GREATEST(
        rb.registered_at,
        rb.activated_at,
        ca.last_commission_at
      ) AS "lastActivityAt",
      rb.status
    FROM referral_base rb
    LEFT JOIN commission_agg ca ON ca.user_id = rb.referred_user_id
    LEFT JOIN profiles p ON p.id = rb.referred_user_id
    ORDER BY COALESCE(ca.total_sales, 0) DESC, rb.registered_at DESC
    LIMIT GREATEST(p_limit, 1)
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.partner_leaderboard(p_metric text DEFAULT 'sales', p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH partner_metrics AS (
    SELECT
      pt.id AS partner_id,
      pt.user_id,
      pt.referral_code,
      pt.tier_key,
      pt.signup_count,
      pt.active_account_count,
      pt.visit_count,
      pt.total_earnings,
      COALESCE(SUM(pc.base_amount) FILTER (
        WHERE pc.service_type <> 'registration'
          AND pc.status IN ('approved', 'withdrawable', 'paid')
      ), 0)::numeric(12, 2) AS total_sales,
      COALESCE(SUM(pc.amount) FILTER (
        WHERE pc.status IN ('approved', 'withdrawable', 'paid', 'pending', 'pending_activation')
      ), 0)::numeric(12, 2) AS total_commissions,
      CASE
        WHEN pt.signup_count > 0 THEN ROUND((pt.active_account_count::numeric / pt.signup_count) * 100, 2)
        ELSE 0
      END AS conversion_rate
    FROM partners pt
    LEFT JOIN partner_commissions pc ON pc.partner_id = pt.id
    WHERE pt.status = 'active'
    GROUP BY pt.id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  FROM (
    SELECT
      pm.partner_id AS "partnerId",
      pm.user_id AS "userId",
      pm.referral_code AS "referralCode",
      pm.tier_key AS "tierKey",
      pr.username,
      pr.email,
      pm.total_sales AS "totalSales",
      pm.total_commissions AS "totalCommissions",
      pm.signup_count AS "signupCount",
      pm.active_account_count AS "activeAccountCount",
      pm.conversion_rate AS "conversionRate",
      pm.total_earnings AS "totalEarnings"
    FROM partner_metrics pm
    LEFT JOIN profiles pr ON pr.id = pm.user_id
    ORDER BY
      CASE p_metric
        WHEN 'commissions' THEN pm.total_commissions
        WHEN 'referrals' THEN pm.signup_count
        WHEN 'active_accounts' THEN pm.active_account_count
        WHEN 'conversion' THEN pm.conversion_rate
        ELSE pm.total_sales
      END DESC,
      pm.total_earnings DESC
    LIMIT GREATEST(p_limit, 1)
  ) r;
$$;

CREATE OR REPLACE FUNCTION public.admin_partner_analytics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH partner_stats AS (
    SELECT
      COUNT(*)::bigint AS total_partners,
      COUNT(*) FILTER (WHERE status = 'active')::bigint AS active_partners
    FROM partners
  ),
  commission_stats AS (
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE status IN ('approved', 'withdrawable', 'paid', 'pending', 'pending_activation')
      ), 0)::numeric(12, 2) AS total_commissions,
      COALESCE(SUM(base_amount) FILTER (
        WHERE service_type <> 'registration'
          AND status IN ('approved', 'withdrawable', 'paid')
      ), 0)::numeric(12, 2) AS total_sales
    FROM partner_commissions
  ),
  withdrawal_stats AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric(12, 2) AS total_withdrawals
    FROM partner_withdrawals
  ),
  top_services AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'serviceType', service_type,
      'count', commission_count,
      'sales', total_sales
    ) ORDER BY total_sales DESC), '[]'::jsonb) AS items
    FROM (
      SELECT
        COALESCE(service_type, 'unknown') AS service_type,
        COUNT(*)::bigint AS commission_count,
        COALESCE(SUM(base_amount), 0)::numeric(12, 2) AS total_sales
      FROM partner_commissions
      WHERE service_type <> 'registration'
        AND status IN ('approved', 'withdrawable', 'paid')
      GROUP BY 1
      ORDER BY total_sales DESC
      LIMIT 10
    ) s
  ),
  top_tiers AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tierKey', tier_key,
      'count', partner_count
    ) ORDER BY partner_count DESC), '[]'::jsonb) AS items
    FROM (
      SELECT tier_key, COUNT(*)::bigint AS partner_count
      FROM partners
      GROUP BY tier_key
      ORDER BY partner_count DESC
    ) t
  ),
  latest_signups AS (
    SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x."registeredAt" DESC), '[]'::jsonb) AS items
    FROM (
      SELECT
        pr.id,
        pr.partner_id AS "partnerId",
        pr.referred_username AS username,
        pr.registered_at AS "registeredAt",
        pr.status
      FROM partner_referrals pr
      ORDER BY pr.registered_at DESC
      LIMIT 10
    ) x
  ),
  latest_withdrawals AS (
    SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x."createdAt" DESC), '[]'::jsonb) AS items
    FROM (
      SELECT
        pw.id,
        pw.partner_id AS "partnerId",
        pw.amount,
        pw.currency,
        pw.network,
        pw.status,
        pw.created_at AS "createdAt"
      FROM partner_withdrawals pw
      ORDER BY pw.created_at DESC
      LIMIT 10
    ) x
  )
  SELECT jsonb_build_object(
    'totalPartners', ps.total_partners,
    'activePartners', ps.active_partners,
    'totalCommissions', cs.total_commissions,
    'totalWithdrawals', ws.total_withdrawals,
    'totalSales', cs.total_sales,
    'topServices', (SELECT items FROM top_services),
    'topTiers', (SELECT items FROM top_tiers),
    'latestSignups', (SELECT items FROM latest_signups),
    'latestWithdrawals', (SELECT items FROM latest_withdrawals)
  )
  FROM partner_stats ps
  CROSS JOIN commission_stats cs
  CROSS JOIN withdrawal_stats ws;
$$;

CREATE OR REPLACE FUNCTION public.admin_top_partners(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.partner_leaderboard('sales', p_limit);
$$;

CREATE OR REPLACE FUNCTION public.admin_partner_timeline(p_partner_id uuid, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH events AS (
    SELECT
      'client_registered'::text AS event_type,
      pr.registered_at AS event_at,
      pr.id AS reference_id,
      'referral'::text AS reference_type,
      COALESCE(pr.referred_username, 'عميل') AS title,
      pr.status AS meta
    FROM partner_referrals pr
    WHERE pr.partner_id = p_partner_id

    UNION ALL

    SELECT
      'first_commission'::text,
      MIN(pc.created_at),
      (array_agg(pc.id ORDER BY pc.created_at))[1],
      'commission'::text,
      'أول عمولة — ' || COALESCE((array_agg(pc.service_type ORDER BY pc.created_at))[1], 'unknown'),
      (array_agg(pc.status ORDER BY pc.created_at))[1]
    FROM partner_commissions pc
    WHERE pc.partner_id = p_partner_id
      AND pc.user_id IS NOT NULL
    GROUP BY pc.user_id

    UNION ALL

    SELECT
      'tier_upgrade'::text,
      p.tier_updated_at,
      p.id,
      'partner'::text,
      'ترقية المستوى — ' || COALESCE(p.tier_key, 'partner'),
      p.tier_key
    FROM partners p
    WHERE p.id = p_partner_id
      AND p.tier_updated_at IS NOT NULL

    UNION ALL

    SELECT
      CASE pw.status
        WHEN 'pending' THEN 'withdrawal_request'
        WHEN 'approved' THEN 'withdrawal_approved'
        WHEN 'paid' THEN 'withdrawal_paid'
        WHEN 'rejected' THEN 'withdrawal_rejected'
        ELSE 'withdrawal_update'
      END,
      COALESCE(pw.paid_at, pw.rejected_at, pw.approved_at, pw.created_at),
      pw.id,
      'withdrawal'::text,
      'طلب سحب — ' || pw.amount::text || ' ' || pw.currency,
      pw.status
    FROM partner_withdrawals pw
    WHERE pw.partner_id = p_partner_id

    UNION ALL

    SELECT
      CASE pwl.type
        WHEN 'adjustment' THEN 'admin_adjustment'
        ELSE pwl.type
      END,
      pwl.created_at,
      pwl.id,
      COALESCE(pwl.reference_type, 'ledger'),
      COALESCE(pwl.note, pwl.type),
      pwl.type
    FROM partner_wallet_ledger pwl
    WHERE pwl.partner_id = p_partner_id
      AND pwl.type IN ('adjustment', 'commission_release')
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t."eventAt" DESC), '[]'::jsonb)
  FROM (
    SELECT
      event_type AS "eventType",
      event_at AS "eventAt",
      reference_id AS "referenceId",
      reference_type AS "referenceType",
      title,
      meta
    FROM events
    WHERE event_at IS NOT NULL
    ORDER BY event_at DESC
    LIMIT GREATEST(p_limit, 1)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.partner_analytics_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_analytics_charts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_top_referrals(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_leaderboard(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_partner_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_top_partners(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_partner_timeline(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.partner_analytics_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_analytics_charts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_top_referrals(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_leaderboard(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_partner_analytics() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_partners(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_partner_timeline(uuid, integer) TO service_role;
