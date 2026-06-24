"use client";

import { useCallback } from "react";

export function useAdminFetch() {
  return useCallback(async (url, options = {}) => {
    let response = await fetch(url, { ...options, credentials: "same-origin" });

    if (response.status !== 401) {
      return response;
    }

    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });

    if (!refreshResponse.ok) {
      return response;
    }

    response = await fetch(url, { ...options, credentials: "same-origin" });
    return response;
  }, []);
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
