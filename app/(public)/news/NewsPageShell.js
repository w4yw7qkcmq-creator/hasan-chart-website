import Breadcrumbs from "../../components/seo/Breadcrumbs";
import { NewsHubLinks } from "../../components/news/NewsHubLinks";
import { NEWS_BREADCRUMBS } from "../../components/news/newsListFormatting";
import NewsHeroRefresh from "./NewsHeroRefresh";

export default function NewsPageShell() {
  return (
    <>
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

        <NewsHeroRefresh />
      </header>

      <NewsHubLinks />
    </>
  );
}
