import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/recommend/route";

describe("/api/recommend", () => {
  it("rejects unsupported legacy and extra fields", async () => {
    const payload = validPayload();
    const response = await POST(jsonRequest({ ...payload, unexpected: true }));
    assert.equal(response.status, 400);

    const legacy = validPayload();
    legacy.input.activity.mode = "everyday";
    const legacyResponse = await POST(jsonRequest(legacy));
    assert.equal(legacyResponse.status, 400);
  });

  it("returns versioned safe variants for a valid request", async () => {
    const response = await POST(jsonRequest(validPayload()));
    const body = await response.json() as { source: string; engineVersion: string; safetyPolicyVersion: string; variants: unknown[] };
    assert.equal(response.status, 200);
    assert.equal(body.source, "rules");
    assert.match(body.engineVersion, /^shortsai-rules-/);
    assert.match(body.safetyPolicyVersion, /^shortsai-safety-/);
    assert.ok(body.variants.length >= 1 && body.variants.length <= 3);
  });
});

function jsonRequest(value: unknown) {
  return new Request("https://shorts-ai.test/api/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
}

function validPayload() {
  const weather = { temperatureC: 17, feelsLikeC: 17, windKph: 10, humidityPercent: 50, rainProbabilityPercent: 10, uvIndex: 2, time: "2026-07-19T10:00:00Z", locationLabel: "Test" };
  return {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    input: {
      current: weather, forecastAtFinish: weather, forecastAtReturn: weather,
      activity: { mode: "walking", startTime: weather.time, returnHomeTime: "2026-07-19T11:00:00Z", durationMinutes: 45 },
      personalization: { starterProfile: "standard", ratedRecommendations: 0 },
    },
  };
}
