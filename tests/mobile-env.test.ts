import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeMobileApiBaseUrl } from "../apps/mobile/src/lib/env";

describe("mobile API base URL", () => {
  it("adds an HTTP scheme to a LAN host", () => {
    assert.equal(normalizeMobileApiBaseUrl("192.168.0.200"), "http://192.168.0.200");
  });

  it("keeps explicit schemes and removes a trailing slash", () => {
    assert.equal(normalizeMobileApiBaseUrl("https://shorts-ai.example/"), "https://shorts-ai.example");
    assert.equal(normalizeMobileApiBaseUrl("http://localhost:3000/"), "http://localhost:3000");
  });

  it("keeps an unconfigured value empty", () => {
    assert.equal(normalizeMobileApiBaseUrl(undefined), "");
    assert.equal(normalizeMobileApiBaseUrl("  "), "");
  });
});
