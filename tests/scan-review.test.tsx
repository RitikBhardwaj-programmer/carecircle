// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { PrescriptionScan } from "@/components/ai-tools";
import { SessionProvider, type SessionInfo } from "@/components/session-context";
import { axeViolations } from "./a11y";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const session: SessionInfo = {
  profile: {
    id: "p1",
    code: "CARE-AAAA-BBBB",
    elderName: "Asha Devi",
    timezone: "Asia/Kolkata",
    language: "en",
    settings: { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: true, escalateAfterMin: 60 },
  },
  member: { id: "m1", name: "Asha Devi", email: null, role: "elder", permission: "manage" },
  can: { write: true, manageCircle: true },
};

const THREE = [
  { name: "Amlodipine", dosage: "5 mg", instructions: "Morning", times: ["08:00"] },
  { name: "Metformin", dosage: "500 mg", instructions: "After food", times: ["08:00", "20:00"] },
  { name: "Atorvastatin", dosage: "10 mg", instructions: "", times: ["21:00"] },
];

/** Fake server: the scan returns `drafts`; saving `failName` fails once with a 500. */
function fakeServer(drafts: Array<(typeof THREE)[number] & { days?: number[] }>, failName?: string) {
  const posted: Array<{ name: string }> = [];
  let failed = false;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url) === "/api/ai/scan") return new Response(JSON.stringify({ drafts }), { status: 200 });
    const body = JSON.parse(String((init as RequestInit).body)) as { name: string };
    if (body.name === failName && !failed) {
      failed = true;
      return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong." } }), {
        status: 500,
      });
    }
    posted.push(body);
    return new Response(JSON.stringify({ medication: { id: body.name } }), { status: 201 });
  });
  return { spy, posted };
}

async function scan(onSaved = vi.fn()) {
  const view = render(
    <SessionProvider value={session}>
      <PrescriptionScan today="2026-11-15" onSaved={onSaved} />
    </SessionProvider>,
  );
  const file = new File([new Uint8Array([1, 2, 3])], "rx.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Choose or take a photo"), { target: { files: [file] } });
  await screen.findByRole("heading", { name: /Review medicines from your prescription \(\d+ found\)/ });
  return view;
}

const card = (name: string) => screen.getByRole("heading", { name: new RegExp(`^${name}`) }).closest("li")!;

describe("prescription scan review (bug: other drafts were lost after saving one)", () => {
  it("shows all drafts together, focuses the review heading and is accessible", async () => {
    fakeServer(THREE);
    const { container } = await scan();
    for (const d of THREE) expect(card(d.name)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Review medicines from your prescription (3 found)" }),
    ).toHaveFocus();
    expect(screen.getByText(/Check each medicine against the paper prescription/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("Save 3 medicines saves all three with three POST calls from one upload", async () => {
    const { posted } = fakeServer(THREE);
    const onSaved = vi.fn();
    await scan(onSaved);
    fireEvent.click(screen.getByRole("button", { name: "Save 3 medicines" }));
    await waitFor(() =>
      expect(posted.map((p) => p.name)).toEqual(["Amlodipine", "Metformin", "Atorvastatin"]),
    );
    for (const d of THREE) expect(await within(card(d.name)).findByText("Saved")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("saving one alone leaves the others in the list, still to be saved", async () => {
    const { posted } = fakeServer(THREE);
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Save only Metformin" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(await within(card("Metformin")).findByText("Saved")).toBeInTheDocument();
    expect(within(card("Amlodipine")).queryByText("Saved")).toBeNull();
    expect(screen.getByRole("button", { name: "Save 2 medicines" })).toBeInTheDocument();
  });

  it("editing one draft keeps the other two, and the edit does not post", async () => {
    const { posted } = fakeServer(THREE);
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Edit Amlodipine" }));
    fireEvent.change(screen.getByLabelText("Dosage", { exact: false }), { target: { value: "10 mg" } });
    fireEvent.click(screen.getByRole("button", { name: "Update this medicine" }));
    expect(within(card("Amlodipine")).getByText("10 mg")).toBeInTheDocument();
    expect(card("Metformin")).toBeInTheDocument();
    expect(card("Atorvastatin")).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it("a draft with no dosage or no time is flagged and left out of Save N until it is edited", async () => {
    const { posted } = fakeServer([THREE[0]!, { ...THREE[1]!, dosage: "" }, { ...THREE[2]!, times: [] }]);
    await scan();
    expect(within(card("Metformin")).getByText(/Needs a fix before saving: the dosage/)).toBeInTheDocument();
    expect(
      within(card("Atorvastatin")).getByText(/Needs a fix before saving: at least one time/),
    ).toBeInTheDocument();
    expect(within(card("Metformin")).getByRole("checkbox")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 medicine" }));
    await waitFor(() => expect(posted.map((p) => p.name)).toEqual(["Amlodipine"]));
  });

  it("a failed save shows Retry for that medicine; the others stay saved; Retry saves it", async () => {
    const { posted } = fakeServer(THREE, "Metformin");
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Save 3 medicines" }));
    expect(await screen.findByRole("button", { name: "Try saving Metformin again" })).toBeInTheDocument();
    expect(within(card("Amlodipine")).getByText("Saved")).toBeInTheDocument();
    expect(within(card("Atorvastatin")).getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard the rest" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try saving Metformin again" }));
    expect(await within(card("Metformin")).findByText("Saved")).toBeInTheDocument();
    expect(posted.map((p) => p.name).sort()).toEqual(["Amlodipine", "Atorvastatin", "Metformin"]);
  });

  it("Remove drops a draft and Done or Discard closes the review", async () => {
    fakeServer(THREE);
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Remove Atorvastatin" }));
    expect(screen.queryByRole("heading", { name: /^Atorvastatin/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Save 2 medicines" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard the rest" }));
    expect(screen.queryByRole("heading", { name: /Review medicines/ })).toBeNull();
  });
});

describe("weekly medicines from a scan are never saved as every day", () => {
  const WEEKLY = [
    { name: "Amlodipine", dosage: "5 mg", instructions: "Morning", times: ["08:00"] },
    { name: "Vitamin D3", dosage: "60000 IU", instructions: "Take once a week", times: ["08:00"] },
  ];

  it("a weekly draft with no days is flagged and not counted on the Save button", async () => {
    const { posted } = fakeServer(WEEKLY);
    await scan();
    expect(within(card("Vitamin D3")).getByText(/not a daily medicine/)).toBeInTheDocument();
    expect(within(card("Vitamin D3")).getByRole("checkbox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save only Vitamin D3" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 medicine" }));
    await waitFor(() => expect(posted.map((p) => p.name)).toEqual(["Amlodipine"]));
  });

  it("becomes saveable after a person chooses its day, and is saved with that day", async () => {
    const { posted } = fakeServer(WEEKLY);
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Edit Vitamin D3" }));
    fireEvent.click(screen.getByLabelText("Sun"));
    fireEvent.click(screen.getByRole("button", { name: "Update this medicine" }));
    expect(within(card("Vitamin D3")).queryByText(/not a daily medicine/)).toBeNull();
    expect(within(card("Vitamin D3")).getByText(/Sun/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save 2 medicines" }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted.find((p) => p.name === "Vitamin D3")).toMatchObject({ days: [0] });
  });

  it("a weekly draft whose day came from the prescription shows it and is saveable", async () => {
    fakeServer([{ ...WEEKLY[1]!, days: [4] }]);
    await scan();
    expect(within(card("Vitamin D3")).getByText(/Thu/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 1 medicine" })).toBeEnabled();
  });
});
