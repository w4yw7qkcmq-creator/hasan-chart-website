import { revalidatePath } from "next/cache";

/**
 * Invalidate public ISR caches for content posts after admin mutations.
 */
export function revalidateContentPostPages({ contentType, slug, previousSlug } = {}) {
  const paths = new Set(["/content-sitemap.xml"]);

  if (!contentType || contentType === "academy") {
    paths.add("/academy");
  }
  if (!contentType || contentType === "result") {
    paths.add("/results");
  }

  const listPath =
    contentType === "result" ? "/results" : contentType === "academy" ? "/academy" : null;

  if (listPath && slug) {
    paths.add(`${listPath}/${slug}`);
  }
  if (listPath && previousSlug && previousSlug !== slug) {
    paths.add(`${listPath}/${previousSlug}`);
  }

  for (const path of paths) {
    revalidatePath(path);
  }
}
