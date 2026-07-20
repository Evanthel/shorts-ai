import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFeedbackDeepLink,
  getFeedbackDueAt,
  getFeedbackRecoveryMode,
  parseFeedbackDeepLink,
} from "@shorts-ai/core";

describe("post-activity feedback lifecycle", () => {
  it("schedules feedback fifteen minutes after return", () => {
    assert.equal(getFeedbackDueAt("2026-07-19T10:00:00Z"), "2026-07-19T10:15:00.000Z");
  });

  it("falls back to in-app recovery when notifications are denied", () => {
    assert.equal(getFeedbackRecoveryMode("granted"), "notification");
    assert.equal(getFeedbackRecoveryMode("denied"), "in_app");
    assert.equal(getFeedbackRecoveryMode("undetermined"), "in_app");
  });

  it("deep-links to the exact client request after restart", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const link = createFeedbackDeepLink(id);
    assert.equal(link, `shortsai://feedback/${id}`);
    assert.equal(parseFeedbackDeepLink(link), id);
    assert.equal(parseFeedbackDeepLink("shortsai://feedback"), null);
  });
});
