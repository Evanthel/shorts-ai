import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/20260719000000_recommendation_system_v2.sql", import.meta.url);

describe("recommendation data migration", () => {
  it("enforces idempotency, updatable feedback, and user-scoped RLS", async () => {
    const sql = await readFile(migrationPath, "utf8");
    assert.match(sql, /unique index[^;]+client_request_id/i);
    assert.match(sql, /feedback_user_recommendation_key/i);
    assert.match(sql, /recommendation_candidates enable row level security/i);
    assert.match(sql, /ai_interactions enable row level security/i);
    assert.match(sql, /auth\.uid\(\) = user_id/i);
  });

  it("has no raw AI question storage column", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const aiTable = sql.match(/create table if not exists public\.ai_interactions \(([\s\S]*?)\);/i)?.[1] ?? "";
    assert.doesNotMatch(aiTable, /^\s*(question|prompt|raw_question|raw_text)\s+/im);
  });
});
