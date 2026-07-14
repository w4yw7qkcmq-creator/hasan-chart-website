import HomePageClient from "./HomePageClient";
import HomeHeroCopy from "./components/home/HomeHeroCopy";
import { REVALIDATE_HOME_PAGE } from "../lib/public-cache-config";

export const revalidate = REVALIDATE_HOME_PAGE;

export default function Home() {
  return <HomePageClient heroCopy={<HomeHeroCopy />} />;
}
