import "@testing-library/jest-dom/vitest";

process.env.SESSION_SECRET ??= "test-session-secret-that-is-long-enough-123456";
process.env.APP_URL ??= "http://localhost:3005";
