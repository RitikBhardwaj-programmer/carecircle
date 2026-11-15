import { ALPHABET, generatePasscode, generateProfileCode, hashPasscode, verifyPasscode } from "./passcode";
import {
  createDoseLinkToken,
  createSessionToken,
  DOSE_LINK_TTL_MS,
  SESSION_TTL_MS,
  verifyDoseLinkToken,
  verifySessionToken,
} from "./tokens";

const SECRET = "x".repeat(40);
const now = new Date("2026-11-15T04:30:00Z");

describe("passcodes", () => {
  it("are 8 characters from the safe alphabet", () => {
    for (let i = 0; i < 50; i += 1) {
      const p = generatePasscode();
      expect(p).toHaveLength(8);
      for (const ch of p) expect(ALPHABET).toContain(ch);
    }
    expect(ALPHABET).not.toMatch(/[0O1I]/);
  });

  it("profile codes match CARE-XXXX-XXXX", () => {
    expect(generateProfileCode()).toMatch(/^CARE-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("hash verifies the right passcode only, case-insensitively", async () => {
    const { hash, salt } = await hashPasscode("ABCD2345");
    expect(await verifyPasscode("ABCD2345", hash, salt)).toBe(true);
    expect(await verifyPasscode("abcd2345", hash, salt)).toBe(true);
    expect(await verifyPasscode("ABCD2346", hash, salt)).toBe(false);
  });

  it("uses a fresh salt each time", async () => {
    const a = await hashPasscode("ABCD2345");
    const b = await hashPasscode("ABCD2345");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("rejects a hash of a different length", async () => {
    const { salt } = await hashPasscode("ABCD2345");
    expect(await verifyPasscode("ABCD2345", "c2hvcnQ=", salt)).toBe(false);
  });
});

describe("session tokens", () => {
  const token = createSessionToken("p1", "m1", now, SECRET);

  it("round-trip", () => {
    expect(verifySessionToken(token, now, SECRET)).toEqual({
      profileId: "p1",
      memberId: "m1",
      exp: now.getTime() + SESSION_TTL_MS,
    });
  });

  it("expire after 12 hours", () => {
    expect(verifySessionToken(token, new Date(now.getTime() + SESSION_TTL_MS), SECRET)).toBeNull();
  });

  it("reject a wrong secret", () => {
    expect(verifySessionToken(token, now, "y".repeat(40))).toBeNull();
  });

  it("reject a tampered payload", () => {
    const [, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "p1", m: "admin", exp: 9e15 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${mac}`, now, SECRET)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", "x".repeat(2000), "e30.e30"])("reject malformed token %#", (bad) => {
    expect(verifySessionToken(bad, now, SECRET)).toBeNull();
  });
});

describe("dose link tokens", () => {
  const claims = { profileId: "p1", doseId: "med-1_2026-11-15_0800", memberId: "m1" };
  const token = createDoseLinkToken(claims, now, SECRET);

  it("round-trip", () => {
    expect(verifyDoseLinkToken(token, now, SECRET)).toEqual(claims);
  });

  it("expire after 24 hours", () => {
    expect(verifyDoseLinkToken(token, new Date(now.getTime() + DOSE_LINK_TTL_MS + 1), SECRET)).toBeNull();
  });

  it("cannot be used as a session token and vice versa", () => {
    expect(verifySessionToken(token, now, SECRET)).toBeNull();
    expect(verifyDoseLinkToken(createSessionToken("p1", "m1", now, SECRET), now, SECRET)).toBeNull();
  });
});
