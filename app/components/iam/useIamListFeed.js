"use client";
import { useCallback, useRef, useState } from "react";
import { adminFetch } from "../../../lib/admin-fetch";
export function useIamListFeed(
  basePath,
  { legacyKey = "items", defaultLimit = 50 } = {},
) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const filtersRef = useRef({});
  const buildUrl = useCallback(
    (cursor, filters = {}) => {
      const params = new URLSearchParams({ limit: String(defaultLimit) });
      if (cursor) params.set("cursor", cursor);
      Object.entries(filters).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          String(value).trim() !== ""
        ) {
          params.set(key, String(value));
        }
      });
      return `${basePath}?${params.toString()}`;
    },
    [basePath, defaultLimit],
  );
  const load = useCallback(
    async (filters = {}, { append = false, cursor = null } = {}) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        filtersRef.current = filters;
      }
      setError("");
      try {
        const res = await adminFetch(
          buildUrl(cursor, append ? filtersRef.current : filters),
        );
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || "تعذر تحميل البيانات");
        }
        const pageItems = json.items || json[legacyKey] || [];
        const pagination = json.pagination || {};
        setItems((current) =>
          append ? [...current, ...pageItems] : pageItems,
        );
        setHasMore(Boolean(pagination.hasMore));
        setNextCursor(pagination.nextCursor || null);
        return pageItems;
      } catch (err) {
        setError(err?.message || "تعذر تحميل البيانات");
        if (!append) setItems([]);
        return [];
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl, legacyKey],
  );
  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor) return Promise.resolve([]);
    return load(filtersRef.current, { append: true, cursor: nextCursor });
  }, [hasMore, loadingMore, load, nextCursor]);
  const fetchDetail = useCallback(
    async (id) => {
      if (!id) return null;
      const res = await adminFetch(
        `${basePath}?id=${encodeURIComponent(id)}&includeMetadata=true`,
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "تعذر تحميل التفاصيل");
      }
      return json.item || null;
    },
    [basePath],
  );
  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    load,
    loadMore,
    fetchDetail,
  };
}
