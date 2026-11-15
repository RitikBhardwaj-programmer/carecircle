import { makeDeps, seedProfile, addAndLogin } from "../../../tests/helpers";
import type { TextModel } from "../infra/gemini";
import { DISCLAIMER, explainMedicine, scanPrescription, toPlainText } from "./ai";

function fakeModel(reply: string | Error): TextModel & { calls: number } {
  const m = {
    calls: 0,
    async generate() {
      m.calls += 1;
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return m;
}

const png = { mimeType: "image/png", bytes: Buffer.from([1, 2, 3]) };

describe("scanPrescription (R10)", () => {
  it("returns validated drafts and saves nothing", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const model = fakeModel(JSON.stringify({ medications: [{ name: "Amlodipine", dosage: "5 mg", instructions: "Morning", times: ["08:00"] }] }));
    const drafts = await scanPrescription(model, elder, png);
    expect(drafts).toEqual([{ name: "Amlodipine", dosage: "5 mg", instructions: "Morning", times: ["08:00"] }]);
    expect(await deps.repo.listMedications(elder.profile.id)).toEqual([]);
  });

  it.each([
    ["model error", new Error("timeout")],
    ["invalid JSON", "not json"],
    ["schema violation", JSON.stringify({ medications: [{ name: "", times: ["99:99"] }] })],
  ])("turns %s into a friendly 'enter by hand' error", async (_l, reply) => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    await expect(scanPrescription(fakeModel(reply), elder, png)).rejects.toMatchObject({ code: "UPSTREAM", message: expect.stringMatching(/by hand/) });
  });

  it("rejects wrong file types, empty and oversized images, and view-only members", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const viewer = await addAndLogin(deps, elder, { permission: "view" });
    const m = fakeModel("{}");
    await expect(scanPrescription(m, elder, { mimeType: "image/gif", bytes: Buffer.from([1]) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(scanPrescription(m, elder, { mimeType: "image/png", bytes: Buffer.alloc(0) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(scanPrescription(m, elder, { mimeType: "image/png", bytes: Buffer.alloc(4 * 1024 * 1024 + 1) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(scanPrescription(m, viewer, png)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.calls).toBe(0);
  });
});

describe("toPlainText", () => {
  it("strips Markdown emphasis, headings and star bullets", () => {
    expect(toPlainText("## Title\n**What it is for**\n* lowers sugar\n• with food")).toBe(
      "Title\nWhat it is for\n- lowers sugar\n- with food",
    );
  });
});

describe("explainMedicine (R10)", () => {
  it("always ends with the not-medical-advice line and caches per language", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const model = fakeModel("What it is for: blood pressure.");
    const first = await explainMedicine(model, elder, { name: "Amlodipine-test", dosage: "5 mg", language: "en" });
    expect(first.text.endsWith(DISCLAIMER.en)).toBe(true);
    expect(first.cached).toBe(false);
    const second = await explainMedicine(model, elder, { name: "amlodipine-TEST", dosage: "5 MG", language: "en" });
    expect(second.cached).toBe(true);
    expect(model.calls).toBe(1);
    const hindi = await explainMedicine(model, elder, { name: "Amlodipine-test", dosage: "5 mg", language: "hi" });
    expect(hindi.text).toContain(DISCLAIMER.hi);
    expect(model.calls).toBe(2);
  });

  it("maps model failures and empty answers to UPSTREAM", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    await expect(explainMedicine(fakeModel(new Error("x")), elder, { name: "Fail1", dosage: null, language: "en" })).rejects.toMatchObject({ code: "UPSTREAM" });
    await expect(explainMedicine(fakeModel("   "), elder, { name: "Fail2", dosage: null, language: "en" })).rejects.toMatchObject({ code: "UPSTREAM" });
  });
});
