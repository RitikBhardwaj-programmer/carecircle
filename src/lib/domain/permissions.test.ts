import { can, type Action } from "./permissions";
import type { Permission, Role } from "./types";

describe("authorize table", () => {
  const cases: Array<[Role, Permission, Action, boolean]> = [
    ["elder", "manage", "read", true],
    ["elder", "manage", "write", true],
    ["elder", "manage", "manageCircle", true],
    ["elder", "view", "manageCircle", true],
    ["family", "manage", "read", true],
    ["family", "manage", "write", true],
    ["family", "manage", "manageCircle", false],
    ["caretaker", "manage", "write", true],
    ["caretaker", "manage", "manageCircle", false],
    ["family", "view", "read", true],
    ["family", "view", "write", false],
    ["caretaker", "view", "manageCircle", false],
  ];

  it.each(cases)("%s with %s can %s: %s", (role, permission, action, expected) => {
    expect(can({ role, permission, revokedAt: null }, action)).toBe(expected);
  });

  it("revoked members can do nothing", () => {
    expect(can({ role: "family", permission: "manage", revokedAt: "2026-11-15T00:00:00Z" }, "read")).toBe(false);
  });
});
