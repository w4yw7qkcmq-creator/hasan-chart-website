import Link from "next/link";
import { INTERNAL_LINK_PHRASES } from "../../../lib/internal-links";
const VARIANTS = {
  dark: "ui-public-seo-linkified",
  light: "ui-public-seo-linkified ui-public-seo-linkified--light",
};
export default function LinkifiedText({
  text,
  variant = "dark",
  maxLinks = 2,
  className = "",
}) {
  if (!text) {
    return null;
  }
  const linkClassName = VARIANTS[variant] || VARIANTS.dark;
  let linksUsed = 0;
  let parts = [text];
  for (const { phrase, href } of INTERNAL_LINK_PHRASES) {
    if (linksUsed >= maxLinks) {
      break;
    }
    const nextParts = [];
    for (const part of parts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }
      if (linksUsed >= maxLinks) {
        nextParts.push(part);
        continue;
      }
      const matchIndex = part.indexOf(phrase);
      if (matchIndex === -1) {
        nextParts.push(part);
        continue;
      }
      if (matchIndex > 0) {
        nextParts.push(part.slice(0, matchIndex));
      }
      nextParts.push(
        <Link
          key={`${href}-${matchIndex}-${linksUsed}`}
          href={href}
          className={linkClassName}
        >
          {" "}
          {phrase}{" "}
        </Link>,
      );
      linksUsed += 1;
      const remainder = part.slice(matchIndex + phrase.length);
      if (remainder) {
        nextParts.push(remainder);
      }
    }
    parts = nextParts;
  }
  return <span className={className}>{parts}</span>;
}
