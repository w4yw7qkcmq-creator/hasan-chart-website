import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  safeEncodeURIComponent,
  stripLoneSurrogates,
  truncateWithoutBreakingSurrogates,
} from "../lib/text-safety.js";

const NFP_236164_CONTENT =
  "🚨 تقرير الوظائف الأمريكية NFP يصدر قراءة جديدة\n🌍 الولايات المتحدة\nالسابق: 57K ▪️ التقدير : 85K ▫️ الحالي : 23K- 👈 النتيجة : سلبي للدولار الأمريكي 📚 لمتابعة أَخبار الأَسهم والذهب والعملات إِنضم للقناة من الرابط: »";

function cleanText(text) {
  if (!text) return "";

  return String(text)
    .replace(/https?:\/\/t\.me\/EconomicNewsi/gi, "")
    .replace(/قناة الأخبار الرسمية\s*:*/gi, "")
    .replace(/🔊|📢/g, "")
    .replace(/\b(Reuters|CNBC|Investing\.com|MarketWatch|CoinDesk)\b\s*[-–—:]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getNewsTitleFromContent(content) {
  const arabicSentences = cleanText(content)
    .split(/[.!؟\n]/)
    .map((part) => part.trim())
    .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);

  if (arabicSentences.length > 0) {
    return truncateWithoutBreakingSurrogates(
      arabicSentences[0].replace(/^عاجل\s*[:：-]?\s*/i, ""),
      150
    );
  }

  return "خبر اقتصادي عاجل";
}

describe("news text safety", () => {
  it("does not leave lone surrogates when truncating nfp-236164-shaped content", () => {
    const title = getNewsTitleFromContent(NFP_236164_CONTENT);

    assert.equal(title.length, 149);
    assert.doesNotThrow(() => encodeURIComponent(title));
    assert.doesNotThrow(() => safeEncodeURIComponent(title));

    for (let index = 0; index < title.length; index += 1) {
      const code = title.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = title.charCodeAt(index + 1);
        assert.ok(next >= 0xdc00 && next <= 0xdfff);
      }
    }
  });

  it("safeEncodeURIComponent accepts malformed lone surrogate input", () => {
    const malformed = "abc\uD83D";
    assert.throws(() => encodeURIComponent(malformed), URIError);
    assert.equal(safeEncodeURIComponent(malformed), "abc");
  });

  it("preserves valid Arabic text and economic numbers", () => {
    const arabic = "السابق: 57K المتوقع: 85K الحالي: 23K-";
    assert.equal(stripLoneSurrogates(arabic), arabic);
    assert.equal(truncateWithoutBreakingSurrogates(arabic, 80), arabic);
    assert.equal(safeEncodeURIComponent(arabic), encodeURIComponent(arabic));
  });

  it("news page uses safe twitter encoding and truncation helpers", () => {
    const page = readFileSync("app/(public)/news/[id]/page.js", "utf8");
    assert.match(page, /truncateWithoutBreakingSurrogates/);
    assert.match(page, /safeEncodeURIComponent/);
    assert.doesNotMatch(page, /encodeURIComponent\(title\)/);
  });

  it("nfp-236164 title path no longer reproduces URIError", () => {
    const brokenTitle = cleanText(NFP_236164_CONTENT)
      .split(/[.!؟\n]/)
      .map((part) => part.trim())
      .filter((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18)[0]
      .slice(0, 150);

    assert.throws(() => encodeURIComponent(brokenTitle), URIError);
    assert.doesNotThrow(() => safeEncodeURIComponent(getNewsTitleFromContent(NFP_236164_CONTENT)));
  });
});

console.log("news text safety tests loaded");
