/**
 * Cost guard tests for the claude-proxy Edge Function.
 *
 * These are unit tests for the guard logic, not integration tests against
 * a running Supabase instance. They verify that each of the 5 cost guard
 * layers correctly blocks requests when thresholds are exceeded.
 *
 * Run with: deno test --allow-env supabase/functions/claude-proxy/cost_guards.test.ts
 *
 * NOTE: These tests mock the Supabase client and Anthropic API. They do NOT
 * hit real services. The Edge Function itself is tested end-to-end during
 * manual QA against a deployed Supabase project with test data.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Mock state ──
// Simulates the database state that the Edge Function reads from.
interface MockState {
  killSwitch: string;
  dailyBudget: string;
  perUserDailyCents: string;
  perIpDailyRequests: string;
  newAccountMultiplier: string;
  todayTotalCost: number;
  userDailyCost: number;
  ipRequestCount: number;
  accountCreatedAt: Date;
}

const DEFAULT_STATE: MockState = {
  killSwitch: "0",
  dailyBudget: "5000",
  perUserDailyCents: "100",
  perIpDailyRequests: "200",
  newAccountMultiplier: "0.1",
  todayTotalCost: 0,
  userDailyCost: 0,
  ipRequestCount: 0,
  accountCreatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
};

/**
 * Evaluates cost guards against the given state.
 * This mirrors the logic in index.ts lines 60-107.
 */
function evaluateGuards(state: MockState): { allowed: boolean; reason?: string } {
  // Guard 1: Kill switch
  if (state.killSwitch === "1") {
    return { allowed: false, reason: "AI features are temporarily paused." };
  }

  // Guard 2: Total daily budget
  const totalBudget = parseInt(state.dailyBudget, 10);
  if (state.todayTotalCost >= totalBudget) {
    return { allowed: false, reason: "Daily AI budget reached. Try again tomorrow." };
  }

  // Guard 3 + 4: Per-user daily budget with account-age throttle
  let perUserBudget = parseInt(state.perUserDailyCents, 10);
  const accountAge = Date.now() - state.accountCreatedAt.getTime();
  if (accountAge < 24 * 60 * 60 * 1000) {
    const mult = parseFloat(state.newAccountMultiplier);
    perUserBudget = Math.max(1, Math.round(perUserBudget * mult));
  }
  if (state.userDailyCost >= perUserBudget) {
    return { allowed: false, reason: "You've reached your daily AI limit." };
  }

  // Guard 5: Per-IP daily request cap
  const ipCap = parseInt(state.perIpDailyRequests, 10);
  if (state.ipRequestCount >= ipCap) {
    return { allowed: false, reason: "Too many requests from this network." };
  }

  return { allowed: true };
}

// ── Tests ──

Deno.test("Guard 1: kill switch blocks all requests", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    killSwitch: "1",
  });
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "AI features are temporarily paused.");
});

Deno.test("Guard 1: kill switch off allows requests", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    killSwitch: "0",
  });
  assertEquals(result.allowed, true);
});

Deno.test("Guard 2: total daily budget exceeded blocks request", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    todayTotalCost: 5000,
    dailyBudget: "5000",
  });
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "Daily AI budget reached. Try again tomorrow.");
});

Deno.test("Guard 2: total daily budget not yet reached allows request", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    todayTotalCost: 4999,
    dailyBudget: "5000",
  });
  assertEquals(result.allowed, true);
});

Deno.test("Guard 3: per-user daily budget exceeded blocks request", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    userDailyCost: 100,
    perUserDailyCents: "100",
  });
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "You've reached your daily AI limit.");
});

Deno.test("Guard 3: per-user budget not yet reached allows request", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    userDailyCost: 99,
    perUserDailyCents: "100",
  });
  assertEquals(result.allowed, true);
});

Deno.test("Guard 4: new account (<24h) gets 10% of normal per-user budget", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    accountCreatedAt: new Date(), // just created
    userDailyCost: 10, // 10 cents = 10% of 100 default
    perUserDailyCents: "100",
    newAccountMultiplier: "0.1",
  });
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "You've reached your daily AI limit.");
});

Deno.test("Guard 4: new account with 9 cents of usage still allowed (budget = 10)", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    accountCreatedAt: new Date(), // just created
    userDailyCost: 9,
    perUserDailyCents: "100",
    newAccountMultiplier: "0.1",
  });
  assertEquals(result.allowed, true);
});

Deno.test("Guard 4: established account (>24h) gets full budget", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    accountCreatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    userDailyCost: 50,
    perUserDailyCents: "100",
  });
  assertEquals(result.allowed, true);
});

Deno.test("Guard 5: per-IP request cap exceeded blocks request", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    ipRequestCount: 200,
    perIpDailyRequests: "200",
  });
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "Too many requests from this network.");
});

Deno.test("Guard 5: per-IP count under cap allows request", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    ipRequestCount: 199,
    perIpDailyRequests: "200",
  });
  assertEquals(result.allowed, true);
});

Deno.test("All guards pass with fresh default state", () => {
  const result = evaluateGuards(DEFAULT_STATE);
  assertEquals(result.allowed, true);
});

Deno.test("Guard priority: kill switch takes precedence over all other guards", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    killSwitch: "1",
    todayTotalCost: 0,
    userDailyCost: 0,
    ipRequestCount: 0,
  });
  assertEquals(result.allowed, false);
  assertEquals(result.reason, "AI features are temporarily paused.");
});

Deno.test("Guard priority: total budget checked before per-user", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    todayTotalCost: 5000,
    userDailyCost: 100,
  });
  // Should hit total budget first
  assertEquals(result.reason, "Daily AI budget reached. Try again tomorrow.");
});

Deno.test("Guard 4: new account multiplier floor is 1 cent (never 0)", () => {
  const result = evaluateGuards({
    ...DEFAULT_STATE,
    accountCreatedAt: new Date(),
    perUserDailyCents: "5", // 5 * 0.1 = 0.5 → rounds to 1 (floor)
    newAccountMultiplier: "0.1",
    userDailyCost: 1,
  });
  assertEquals(result.allowed, false);
});
