"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  NEWS_BACKGROUND_FILL_SIZE,
  NEWS_FULL_LIST_SIZE,
  NEWS_SSR_INITIAL_SIZE,
} from "../../../lib/public-cache-config";
import { scheduleAfterPaint } from "../../../lib/schedule-after-paint";
import Breadcrumbs from "../../components/seo/Breadcrumbs";
import {
  getHighImpactNews,
  matchesNewsListFilter,
  matchesNewsSearch,
} from "../../components/news/newsListHelpers";
import { mergeNewsLists } from "../../../lib/news-list-merge";
import {
  extractArabicTitle,
  formatNewsDate,
  NEWS_BREADCRUMBS,
} from "../../components/news/newsListFormatting";
import {
  NewsCard,
  NewsEmptyState,
  NewsHighImpactSection,
  NewsHubLinks,
  NewsSearchPanel,
  NewsSkeletonGrid,
} from "../../components/news/NewsListUi";
import TelegramChannelCTA from "../../components/news/TelegramChannelCTA";
import { useMountedRef } from "../../hooks/useMountedRef";
import { useVisibilityRefresh } from "../../hooks/useVisibilityRefresh";

const SEARCH_DEBOUNCE_MS = 300;
const SILENT_REFRESH_COOLDOWN_MS = 30_000;
const BACKGROUND_FILL_IDLE_TIMEOUT_MS = 800;
const REFRESH_NEWS_LIMIT = NEWS_FULL_LIST_SIZE;

function logNewsFetchIssue(error) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn("News fetch skipped:", error?.message || error);
}

export default function NewsListClient({ initialNews = [] }) {
  const hasInitialNews = Array.isArray(initialNews) && initialNews.length > 0;
  const [news, setNews] = useState(() => (hasInitialNews ? initialNews : []));
  const [loading, setLoading] = useState(!hasInitialNews);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const mountedRef = useMountedRef();
  const fetchPromiseRef = useRef(null);
  const abortControllerRef = useRef(null);
  const backgroundAbortControllerRef = useRef(null);
  const backgroundFillDoneRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const lastFetchKeyRef = useRef("");
  const newsCountRef = useRef(0);

  useEffect(() => {
    newsCountRef.current = news.length;
  }, [news.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const fetchNewsPage = useCallback(async ({ limit, offset, signal }) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const response = await fetch(`/api/news?${params.toString()}`, {
      method: "GET",
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "تعذر تحميل الأخبار من قاعدة البيانات.");
    }

    const payload = await response.json();
    return payload?.items || [];
  }, []);

  const fetchNews = useCallback(
    async ({ silent = false, force = false } = {}) => {
      const fetchKey = `refresh:${REFRESH_NEWS_LIMIT}`;

      if (
        silent &&
        !force &&
        Date.now() - lastFetchAtRef.current < SILENT_REFRESH_COOLDOWN_MS &&
        newsCountRef.current > 0
      ) {
        return;
      }

      if (!force && fetchPromiseRef.current) {
        return fetchPromiseRef.current;
      }

      if (!force && !silent && lastFetchKeyRef.current === fetchKey && newsCountRef.current > 0) {
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const requestPromise = (async () => {
        try {
          if (!silent) {
            setLoading(true);
          } else {
            setRefreshing(true);
          }

          setErrorMessage("");

          const latestItems = await fetchNewsPage({
            limit: REFRESH_NEWS_LIMIT,
            offset: 0,
            signal: controller.signal,
          });

          if (!mountedRef.current || controller.signal.aborted) {
            return;
          }

          setNews(latestItems.slice(0, NEWS_FULL_LIST_SIZE));
          backgroundFillDoneRef.current = true;
          setLastUpdated(formatNewsDate(new Date()));
          lastFetchAtRef.current = Date.now();
          lastFetchKeyRef.current = fetchKey;
        } catch (error) {
          if (!mountedRef.current || controller.signal.aborted) {
            return;
          }

          logNewsFetchIssue(error);
          setErrorMessage(error?.message || "حدث خطأ غير متوقع أثناء تحميل الأخبار.");
          setNews([]);
        } finally {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }

          fetchPromiseRef.current = null;

          if (mountedRef.current) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      })();

      fetchPromiseRef.current = requestPromise;
      return requestPromise;
    },
    [fetchNewsPage]
  );

  const runBackgroundFill = useCallback(async () => {
    if (
      backgroundFillDoneRef.current ||
      NEWS_BACKGROUND_FILL_SIZE <= 0 ||
      newsCountRef.current >= NEWS_FULL_LIST_SIZE
    ) {
      return;
    }

    if (backgroundAbortControllerRef.current) {
      backgroundAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    backgroundAbortControllerRef.current = controller;

    try {
      const backgroundItems = await fetchNewsPage({
        limit: NEWS_BACKGROUND_FILL_SIZE,
        offset: NEWS_SSR_INITIAL_SIZE,
        signal: controller.signal,
      });

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      if (backgroundItems.length === 0) {
        backgroundFillDoneRef.current = true;
        return;
      }

      setNews((currentItems) =>
        mergeNewsLists(currentItems, backgroundItems, NEWS_FULL_LIST_SIZE)
      );
      backgroundFillDoneRef.current = true;
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      logNewsFetchIssue(error);
    } finally {
      if (backgroundAbortControllerRef.current === controller) {
        backgroundAbortControllerRef.current = null;
      }
    }
  }, [fetchNewsPage]);

  useEffect(() => {
    if (hasInitialNews) {
      setLastUpdated(formatNewsDate(new Date()));
      lastFetchAtRef.current = Date.now();
      lastFetchKeyRef.current = `ssr:${NEWS_SSR_INITIAL_SIZE}`;

      if (NEWS_BACKGROUND_FILL_SIZE <= 0 || initialNews.length >= NEWS_FULL_LIST_SIZE) {
        backgroundFillDoneRef.current = true;
        return undefined;
      }

      const cancelScheduledFill = scheduleAfterPaint(() => {
        void runBackgroundFill();
      }, BACKGROUND_FILL_IDLE_TIMEOUT_MS);

      return () => {
        cancelScheduledFill();
        if (backgroundAbortControllerRef.current) {
          backgroundAbortControllerRef.current.abort();
        }
      };
    }

    fetchNews({ force: true });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchNews, hasInitialNews, initialNews.length, runBackgroundFill]);

  useVisibilityRefresh(() => fetchNews({ silent: true }), {
    intervalMs: 60000,
    refreshOnFocus: false,
  });

  const categoryFilteredNews = useMemo(() => {
    return news.filter((item) => matchesNewsListFilter(item, selectedCategory));
  }, [news, selectedCategory]);

  const highImpactNews = useMemo(() => {
    return getHighImpactNews(categoryFilteredNews, 4);
  }, [categoryFilteredNews]);

  const highImpactIds = useMemo(() => {
    return new Set(highImpactNews.map((item) => item.id));
  }, [highImpactNews]);

  const displayNews = useMemo(() => {
    return categoryFilteredNews
      .filter((item) => !highImpactIds.has(item.id))
      .filter((item) => matchesNewsSearch(item, debouncedSearchQuery, extractArabicTitle));
  }, [categoryFilteredNews, debouncedSearchQuery, highImpactIds]);

  function resetFilters() {
    setSelectedCategory("all");
    setSearchQuery("");
    setDebouncedSearchQuery("");
  }

  return (
    <main className="news-page">
      <div className="news-page__bg" aria-hidden="true" />

      <div className="news-page__inner">
        <div className="news-page-breadcrumb">
          <Breadcrumbs items={NEWS_BREADCRUMBS} variant="dark" />
        </div>

        <header className="news-page-hero">
          <span className="news-page-hero__eyebrow">تغطية مالية مباشرة</span>
          <h1 className="news-page-hero__title">الأخبار الاقتصادية العاجلة</h1>
          <p className="news-page-hero__text">
            تغطية يومية لأهم تحركات الأسواق العالمية، العملات الرقمية، الفوركس، الذهب والسلع،
            النفط والطاقة، والبيانات الاقتصادية المؤثرة على قرارات التداول.
          </p>

          <div className="news-page-hero__actions">
            <button
              type="button"
              onClick={() => fetchNews({ force: true })}
              disabled={loading || refreshing}
              className="news-page-hero__refresh"
            >
              {loading || refreshing ? "جاري التحديث…" : "تحديث الأخبار الآن"}
            </button>
            {lastUpdated ? (
              <span className="news-page-hero__updated">آخر تحديث: {lastUpdated}</span>
            ) : null}
          </div>
        </header>

        <NewsHubLinks />
        <NewsSearchPanel
          value={searchQuery}
          onChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        <TelegramChannelCTA />

        {loading ? (
          <NewsSkeletonGrid />
        ) : errorMessage ? (
          <div className="news-page-state news-page-state--error" role="alert">
            <span className="news-page-state__icon" aria-hidden="true">
              ⚠️
            </span>
            <h2 className="news-page-state__title">تعذر تحميل الأخبار حالياً</h2>
            <p className="news-page-state__text">{errorMessage}</p>
            <div className="news-page-state__actions">
              <button type="button" onClick={() => fetchNews({ force: true })} className="news-page-state__action">
                إعادة المحاولة
              </button>
              <Link href="/" className="news-page-state__action news-page-state__action--link">
                العودة للرئيسية
              </Link>
            </div>
          </div>
        ) : categoryFilteredNews.length === 0 ? (
          <NewsEmptyState
            selectedCategory={selectedCategory}
            searchQuery={debouncedSearchQuery}
            onResetFilters={resetFilters}
            onRefresh={() => fetchNews({ force: true })}
          />
        ) : (
          <>
            <NewsHighImpactSection items={highImpactNews} />

            {displayNews.length === 0 ? (
              <NewsEmptyState
                selectedCategory={selectedCategory}
                searchQuery={debouncedSearchQuery}
                onResetFilters={resetFilters}
                onRefresh={() => fetchNews({ force: true })}
              />
            ) : (
              <section className="news-page-grid" aria-label="قائمة الأخبار">
                {displayNews.map((item, index) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    index={index}
                    priority={highImpactNews.length === 0 && index === 0}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
