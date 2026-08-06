#!/usr/bin/env node
/**
 * Active queue + completed history filter tests for VIP recommendations.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VIP_ACTIVE_WINDOW_MS,
  VIP_COMPLETED_HISTORY_LIMIT,
  getActiveWindowCutoffIso,
  isActiveVipRecommendation,
  isCompletedVipRecommendation,
} from "../lib/vip-recommendation-status-dispatch.js";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");
const FRESH = "2026-08-07T10:00:00.000Z";
const STALE = "2026-08-04T10:00:00.000Z";

describe("VIP active queue filters", () => {
  it("includes active recommendations within 48 hours", () => {
    assert.equal(
      isActiveVipRecommendation({ trade_status: "active", created_at: FRESH }, NOW),
      true
    );
  });

  it("includes target_1_hit within 48 hours", () => {
    assert.equal(
      isActiveVipRecommendation({ trade_status: "target_1_hit", created_at: FRESH }, NOW),
      true
    );
  });

  it("excludes active recommendations older than 48 hours", () => {
    assert.equal(
      isActiveVipRecommendation({ trade_status: "active", created_at: STALE }, NOW),
      false
    );
  });

  it("excludes target_2_hit from active queue", () => {
    assert.equal(
      isActiveVipRecommendation({ trade_status: "target_2_hit", created_at: FRESH }, NOW),
      false
    );
  });

  it("excludes closed_immediately from active queue", () => {
    assert.equal(
      isActiveVipRecommendation({ trade_status: "closed_immediately", created_at: FRESH }, NOW),
      false
    );
  });
});

describe("VIP completed history filters", () => {
  it("includes target_2_hit as completed", () => {
    assert.equal(
      isCompletedVipRecommendation({ trade_status: "target_2_hit", created_at: FRESH }, NOW),
      true
    );
  });

  it("includes close_now terminal status as completed", () => {
    assert.equal(
      isCompletedVipRecommendation(
        { trade_status: "closed_immediately", created_at: FRESH },
        NOW
      ),
      true
    );
  });

  it("includes stale active recommendations in completed history", () => {
    assert.equal(
      isCompletedVipRecommendation({ trade_status: "active", created_at: STALE }, NOW),
      true
    );
  });

  it("excludes fresh active recommendations from completed history", () => {
    assert.equal(
      isCompletedVipRecommendation({ trade_status: "active", created_at: FRESH }, NOW),
      false
    );
  });
});

describe("VIP active queue constants", () => {
  it("uses 48 hour active window", () => {
    assert.equal(VIP_ACTIVE_WINDOW_MS, 48 * 60 * 60 * 1000);
  });

  it("builds cutoff iso from reference time", () => {
    const cutoff = getActiveWindowCutoffIso(NOW);
    assert.equal(cutoff, new Date(NOW - VIP_ACTIVE_WINDOW_MS).toISOString());
  });

  it("limits completed history to 10 by default", () => {
    assert.equal(VIP_COMPLETED_HISTORY_LIMIT, 10);
  });
});

console.log("test-vip-recommendation-active-queue: loaded");
