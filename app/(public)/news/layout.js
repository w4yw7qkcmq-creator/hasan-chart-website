import { REVALIDATE_PUBLIC_NEWS } from "../../../lib/public-cache-config";

export const revalidate = REVALIDATE_PUBLIC_NEWS;

export default function NewsLayout({ children }) {
  return children;
}
