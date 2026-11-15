// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { Assistant } from "@/components/assistant";
import { EmptyState, ErrorSummary } from "@/components/feedback";
import { SessionProvider, type SessionInfo } from "@/components/session-context";
import { axeViolations } from "./a11y";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});

function session(write = true): SessionInfo {
  return {
    profile: {
      id: "p1",
      code: "CARE-AAAA-BBBB",
      elderName: "Asha Devi",
      timezone: "Asia/Kolkata",
      language: "en",
      settings: { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: true, escalateAfterMin: 60 },
    },
    member: {
      id: "m1",
      name: "Asha Devi",
      email: null,
      role: write ? "elder" : "family",
      permission: write ? "manage" : "view",
    },
    can: { write, manageCircle: write },
  };
}

function reply(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

const markIntent = {
  type: "mark_dose",
  reply: "I will mark your morning dose.",
  doseId: "med-1_2026-11-15_0800",
  status: "taken",
  dose: { id: "med-1_2026-11-15_0800", name: "Metformin", dosage: "500 mg", time: "08:00", state: "due" },
};

describe("Assistant (Ask CareCircle)", () => {
  it("is accessible, and an example chip sends its text", async () => {
    const fetchSpy = reply({ type: "answer", reply: "Metformin at 20:00 is left." });
    const { container } = render(
      <SessionProvider value={session()}>
        <Assistant onMark={vi.fn()} />
      </SessionProvider>,
    );
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "What is left today?" }));
    expect(await screen.findByText("Metformin at 20:00 is left.")).toBeInTheDocument();
    const body = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(body).toEqual({ text: "What is left today?", lang: "en" });
    expect(await axeViolations(container)).toEqual([]);
  });

  it("a mark-dose proposal shows a confirm card naming the medicine; No changes nothing", async () => {
    reply(markIntent);
    const onMark = vi.fn();
    render(
      <SessionProvider value={session()}>
        <Assistant onMark={onMark} />
      </SessionProvider>,
    );
    fireEvent.change(screen.getByLabelText("Tell me what you need"), {
      target: { value: "I took my morning tablet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const heading = await screen.findByRole("heading", { name: "Please confirm" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText(/08:00 · Metformin/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onMark).not.toHaveBeenCalled();
    expect(screen.getByText("Nothing was changed.")).toBeInTheDocument();
  });

  it("Yes marks the dose through the normal path", async () => {
    reply(markIntent);
    const onMark = vi.fn();
    render(
      <SessionProvider value={session()}>
        <Assistant onMark={onMark} />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "I took my morning tablet" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, do it" }));
    await waitFor(() => expect(onMark).toHaveBeenCalledWith("med-1_2026-11-15_0800", "taken"));
  });

  it("never shows a confirm card to a view-only member", async () => {
    reply(markIntent);
    render(
      <SessionProvider value={session(false)}>
        <Assistant onMark={vi.fn()} />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "I took my morning tablet" }));
    await waitFor(() => expect(screen.queryByText(/Thinking/)).toBeNull());
    expect(screen.queryByRole("button", { name: "Yes, do it" })).toBeNull();
  });

  it("an add-medication proposal opens the form page with a draft, saving nothing", async () => {
    const fetchSpy = reply({
      type: "add_medication",
      reply: "Check it.",
      medication: { name: "Aspirin", dosage: "75 mg", instructions: "", times: ["09:00"] },
    });
    render(
      <SessionProvider value={session()}>
        <Assistant onMark={vi.fn()} />
      </SessionProvider>,
    );
    fireEvent.change(screen.getByLabelText("Tell me what you need"), { target: { value: "add aspirin" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/medications?draft=1"));
    expect(JSON.parse(window.sessionStorage.getItem("cc-assist-draft") ?? "{}")).toMatchObject({
      kind: "medication",
      data: { name: "Aspirin" },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyState and ErrorSummary", () => {
  it("are accessible; the error summary is an alert that takes focus", async () => {
    const { container } = render(
      <>
        <EmptyState
          icon="pill"
          text="No medicines yet."
          action={{ label: "Add the first medicine", onClick: vi.fn() }}
        />
        <ErrorSummary
          title="There is a problem"
          message="Please check the highlighted fields."
          fields={{ name: "Enter a name" }}
          fieldIds={{ name: "f-name" }}
        />
        <input id="f-name" aria-label="Name" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("link", { name: "Enter a name" })).toHaveAttribute("href", "#f-name");
    expect(await axeViolations(container)).toEqual([]);
  });
});
