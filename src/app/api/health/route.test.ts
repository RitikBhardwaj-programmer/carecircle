import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "carecircle" });
  });
});
