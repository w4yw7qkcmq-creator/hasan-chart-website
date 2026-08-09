"use client";

import { Component } from "react";

export default class NewsSystemStatusPanelBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[NewsSystemStatusPanel] render failure", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="admin-news-page__card admin-news-system" aria-labelledby="news-system-status-title">
          <h2 id="news-system-status-title" className="admin-news-page__card-title">
            حالة نظام الأخبار
          </h2>
          <div className="admin-news-page__alert admin-news-page__alert--error" role="alert">
            بيانات المراقبة غير متاحة مؤقتًا
          </div>
          <button
            type="button"
            className="admin-news-page__submit"
            onClick={() => this.setState({ hasError: false })}
          >
            إعادة المحاولة
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
