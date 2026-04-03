/**
 * Unit tests for lib/access-policy.ts
 *
 * These tests cover the pure helper functions (isOwnerEmail, isPreviewUnlimited)
 * and the async shouldBypassLimits() function with mocked Next.js headers/cookies.
 *
 * The async functions that call next/headers are tested by mocking the module.
 */

// ── Mock next/headers before importing the module under test ─────────────────
const mockCookieStore = {
  get: jest.fn(),
};
const mockHeadersList = {
  get: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
  headers: jest.fn(() => Promise.resolve(mockHeadersList)),
}));

import {
  isOwnerEmail,
  isPreviewUnlimited,
  shouldBypassLimits,
} from "@/lib/access-policy";

// ── Helper to reset mocks and env vars between tests ─────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  // Reset env vars
  delete process.env.OWNER_EMAILS;
  delete process.env.ADMIN_BYPASS_KEY;
  delete process.env.OWNER_BYPASS_COOKIE_NAME;
  delete process.env.PREVIEW_UNLIMITED;
  // Default: no cookie, no header
  mockCookieStore.get.mockReturnValue(undefined);
  mockHeadersList.get.mockReturnValue(null);
});

// ── isOwnerEmail ──────────────────────────────────────────────────────────────
describe("isOwnerEmail", () => {
  it("returns true for the hardcoded primary owner email", () => {
    expect(isOwnerEmail("leehanna8@gmail.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isOwnerEmail("LEEHANNA8@GMAIL.COM")).toBe(true);
    expect(isOwnerEmail("LeeHanna8@Gmail.Com")).toBe(true);
  });

  it("returns false for a non-owner email", () => {
    expect(isOwnerEmail("random@example.com")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });

  it("reads additional owners from OWNER_EMAILS env var", () => {
    process.env.OWNER_EMAILS = "alice@example.com, bob@example.com";
    expect(isOwnerEmail("alice@example.com")).toBe(true);
    expect(isOwnerEmail("bob@example.com")).toBe(true);
    expect(isOwnerEmail("charlie@example.com")).toBe(false);
  });

  it("falls back to hardcoded owner when OWNER_EMAILS is empty string", () => {
    process.env.OWNER_EMAILS = "";
    expect(isOwnerEmail("leehanna8@gmail.com")).toBe(true);
  });
});

// ── isPreviewUnlimited ────────────────────────────────────────────────────────
describe("isPreviewUnlimited", () => {
  it("returns false when env var is not set", () => {
    expect(isPreviewUnlimited()).toBe(false);
  });

  it("returns true when PREVIEW_UNLIMITED=true", () => {
    process.env.PREVIEW_UNLIMITED = "true";
    expect(isPreviewUnlimited()).toBe(true);
  });

  it("returns false when PREVIEW_UNLIMITED=false", () => {
    process.env.PREVIEW_UNLIMITED = "false";
    expect(isPreviewUnlimited()).toBe(false);
  });

  it("returns false when PREVIEW_UNLIMITED=1 (not exactly 'true')", () => {
    process.env.PREVIEW_UNLIMITED = "1";
    expect(isPreviewUnlimited()).toBe(false);
  });
});

// ── shouldBypassLimits ────────────────────────────────────────────────────────
describe("shouldBypassLimits", () => {
  it("bypasses for owner email (reason: owner_email)", async () => {
    const result = await shouldBypassLimits("leehanna8@gmail.com");
    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe("owner_email");
  });

  it("bypasses for owner email in OWNER_EMAILS env var", async () => {
    process.env.OWNER_EMAILS = "custom@owner.com";
    const result = await shouldBypassLimits("custom@owner.com");
    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe("owner_email");
  });

  it("bypasses when valid owner bypass cookie is present (reason: owner_cookie)", async () => {
    process.env.ADMIN_BYPASS_KEY = "test-secret-key-12345";
    process.env.OWNER_BYPASS_COOKIE_NAME = "ai4u_owner_bypass";
    mockCookieStore.get.mockReturnValue({ value: "test-secret-key-12345" });

    const result = await shouldBypassLimits("random@example.com");
    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe("owner_cookie");
  });

  it("does NOT bypass when cookie value does not match ADMIN_BYPASS_KEY", async () => {
    process.env.ADMIN_BYPASS_KEY = "correct-key";
    process.env.OWNER_BYPASS_COOKIE_NAME = "ai4u_owner_bypass";
    mockCookieStore.get.mockReturnValue({ value: "wrong-key" });
    mockHeadersList.get.mockReturnValue(null);

    const result = await shouldBypassLimits("random@example.com");
    expect(result.bypassed).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("bypasses when valid admin bypass header is present (reason: admin_header)", async () => {
    process.env.ADMIN_BYPASS_KEY = "test-secret-key-12345";
    mockCookieStore.get.mockReturnValue(undefined);
    mockHeadersList.get.mockReturnValue("test-secret-key-12345");

    const result = await shouldBypassLimits("random@example.com");
    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe("admin_header");
  });

  it("does NOT bypass when admin header value does not match", async () => {
    process.env.ADMIN_BYPASS_KEY = "correct-key";
    mockCookieStore.get.mockReturnValue(undefined);
    mockHeadersList.get.mockReturnValue("wrong-key");

    const result = await shouldBypassLimits("random@example.com");
    expect(result.bypassed).toBe(false);
  });

  it("bypasses when PREVIEW_UNLIMITED=true (reason: preview_unlimited)", async () => {
    process.env.PREVIEW_UNLIMITED = "true";
    mockCookieStore.get.mockReturnValue(undefined);
    mockHeadersList.get.mockReturnValue(null);

    const result = await shouldBypassLimits("random@example.com");
    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe("preview_unlimited");
  });

  it("does NOT bypass for a regular user with no special conditions", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    mockHeadersList.get.mockReturnValue(null);

    const result = await shouldBypassLimits("regular@example.com");
    expect(result.bypassed).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("does NOT bypass when called with null/undefined email and no other bypass", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    mockHeadersList.get.mockReturnValue(null);

    const result = await shouldBypassLimits(null);
    expect(result.bypassed).toBe(false);
  });

  it("owner_email takes priority over other bypass methods", async () => {
    // Even if cookie and header are wrong, owner email should still bypass
    process.env.ADMIN_BYPASS_KEY = "some-key";
    mockCookieStore.get.mockReturnValue({ value: "wrong-key" });
    mockHeadersList.get.mockReturnValue("wrong-key");

    const result = await shouldBypassLimits("leehanna8@gmail.com");
    expect(result.bypassed).toBe(true);
    expect(result.reason).toBe("owner_email");
  });
});
