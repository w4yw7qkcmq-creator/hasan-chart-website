import "../../styles/daily-analysis.css";
import { REVALIDATE_DAILY_ANALYSIS_PAGE } from "../../../lib/public-cache-config";

export const revalidate = 300;

export default function DailyAnalysisLayout({ children }) {
  return children;
}
