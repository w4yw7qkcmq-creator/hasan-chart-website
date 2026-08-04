/** Explicit IAM admin list projections. */

export const IAM_AUDIT_LIST_COLUMNS =
  "id,actor_id,actor_email,actor_type,action,target_type,target_id,created_at,ip_address,metadata";

export const IAM_AUDIT_DETAIL_COLUMNS =
  "id,actor_id,actor_email,actor_type,service_account_id,action,target_type,target_id,before_data,after_data,metadata,ip_address,user_agent,request_id,created_at";

export const IAM_SECURITY_LIST_COLUMNS =
  "id,event_type,severity,user_id,service_account_id,ip_address,created_at";

export const IAM_SECURITY_DETAIL_COLUMNS =
  "id,event_type,severity,user_id,service_account_id,ip_address,created_at,details,user_agent,request_id,organization_id";

export const IAM_SESSION_LIST_COLUMNS =
  "id,user_id,session_id_hash,started_at,ended_at,end_reason,is_admin_session,last_activity_at,ip_address,user_agent";

export const IAM_SESSION_DETAIL_COLUMNS =
  `${IAM_SESSION_LIST_COLUMNS},user_agent,role_ids,organization_id,metadata,forced_by`;
