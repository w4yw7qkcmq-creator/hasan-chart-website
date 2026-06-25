"use client";

import { useCallback } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";

export function useAdminFetch() {
  return useCallback((url, options = {}) => adminFetch(url, options), []);
}

export function buildAnalyticsQuery(filters, { syncResend = false } = {}) {
  const params = new URLSearchParams();

  if (filters.email) params.set("email", filters.email);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.messageType && filters.messageType !== "all") {
    params.set("messageType", filters.messageType);
  }
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (syncResend) params.set("sync", "resend");

  const query = params.toString();
  return query ? `?${query}` : "";
}
