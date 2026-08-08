import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateContentPostPayload, assertAllowedStatusTransition } from "../lib/content-post-validation.js";

describe("content post validation", () => {
  it("accepts valid academy payload", () => {
    const result = validateContentPostPayload(
      {
        title: "درس SMC",
        body: "محتوى الدرس الكامل هنا",
        category: "SMC",
      },
      { contentType: "academy" }
    );
    assert.equal(result.ok, true);
  });

  it("rejects highlight on academy", () => {
    const result = validateContentPostPayload(
      {
        title: "درس",
        body: "محتوى كافٍ للاختبار",
        highlight_value: "+12%",
      },
      { contentType: "academy" }
    );
    assert.equal(result.ok, false);
  });

  it("allows result highlight", () => {
    const result = validateContentPostPayload(
      {
        title: "Weekly Result",
        body: "نتيجة الأسبوع مع تفاصيل كافية",
        highlight_value: "+12%",
        category: "Weekly Result",
      },
      { contentType: "result" }
    );
    assert.equal(result.ok, true);
  });

  it("validates status transitions", () => {
    assert.equal(assertAllowedStatusTransition("draft", "published").ok, true);
    assert.equal(assertAllowedStatusTransition("published", "archived").ok, true);
    assert.equal(assertAllowedStatusTransition("archived", "published").ok, true);
  });
});

console.log("content post validation tests loaded");
