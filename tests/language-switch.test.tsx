// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { ExplainButton } from "@/components/ai-tools";
import { Assistant } from "@/components/assistant";
import { SessionProvider, useSession, type SessionInfo } from "@/components/session-context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const session: SessionInfo = {
  profile: {
    id: "p1",
    code: "CARE-AAAA-BBBB",
    elderName: "Asha Devi",
    timezone: "Asia/Kolkata",
    language: "hi",
    settings: { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: true, escalateAfterMin: 60 },
  },
  member: { id: "m1", name: "Asha Devi", email: null, role: "elder", permission: "manage" },
  can: { write: true, manageCircle: true },
};

function LangSwitch() {
  const { setLang } = useSession();
  return (
    <>
      <button type="button" onClick={() => setLang("en")}>
        to-en
      </button>
      <button type="button" onClick={() => setLang("hi")}>
        to-hi
      </button>
    </>
  );
}

function explainFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { language: string };
    const text = body.language === "hi" ? "हिंदी में जानकारी" : "English summary";
    return new Response(JSON.stringify({ text }), { status: 200 });
  });
}

function renderExplainer() {
  return render(
    <SessionProvider value={session}>
      <LangSwitch />
      <ExplainButton name="Metformin" dosage="500 mg" />
    </SessionProvider>,
  );
}

describe("explainer follows the language (bug: Hindi summary stayed after switching to English)", () => {
  it("an open explanation is fetched again in the new language, and the old text is gone", async () => {
    const fetchSpy = explainFetch();
    renderExplainer();
    fireEvent.click(screen.getByRole("button", { name: /Metformin/ }));
    expect(await screen.findByText("हिंदी में जानकारी")).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "to-en" })));
    expect(await screen.findByText("English summary")).toBeInTheDocument();
    expect(screen.queryByText("हिंदी में जानकारी")).toBeNull();
    const last = JSON.parse(String((fetchSpy.mock.calls.at(-1)![1] as RequestInit).body));
    expect(last).toMatchObject({ name: "Metformin", language: "en" });

    // And back, English to Hindi.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "to-hi" })));
    expect(await screen.findByText("हिंदी में जानकारी")).toBeInTheDocument();
    expect(screen.queryByText("English summary")).toBeNull();
  });

  it("a closed explanation is cleared, so the next press asks in the new language", async () => {
    const fetchSpy = explainFetch();
    renderExplainer();
    fireEvent.click(screen.getByRole("button", { name: /Metformin/ }));
    await screen.findByText("हिंदी में जानकारी");
    fireEvent.click(screen.getByRole("button", { name: /Metformin/ })); // close
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "to-en" })));
    expect(fetchSpy).toHaveBeenCalledTimes(1); // closed: nothing is fetched until it is pressed
    fireEvent.click(screen.getByRole("button", { name: /Metformin/ }));
    expect(await screen.findByText("English summary")).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("हिंदी में जानकारी")).toBeNull();
  });
});

describe("other text kept on screen follows the language", () => {
  it("the assistant's reply from the old language is cleared", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ type: "answer", reply: "आज शाम 8 बजे Metformin बाकी है।" }), {
        status: 200,
      }),
    );
    render(
      <SessionProvider value={session}>
        <LangSwitch />
        <Assistant onMark={vi.fn()} />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "आज कौन सी दवा बाकी है?" }));
    expect(await screen.findByText("आज शाम 8 बजे Metformin बाकी है।")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "to-en" })));
    expect(screen.queryByText("आज शाम 8 बजे Metformin बाकी है।")).toBeNull();
    expect(screen.getByRole("button", { name: "What is left today?" })).toBeInTheDocument();
  });

  it("a toast in the old language is closed", async () => {
    function Announcer() {
      const { announce } = useSession();
      return (
        <button type="button" onClick={() => announce("ले ली के रूप में दर्ज")}>
          announce
        </button>
      );
    }
    function ToastView() {
      const { toast } = useSession();
      return <p>{toast?.message ?? "no toast"}</p>;
    }
    render(
      <SessionProvider value={session}>
        <LangSwitch />
        <Announcer />
        <ToastView />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "announce" }));
    expect(await screen.findByText("ले ली के रूप में दर्ज")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "to-en" })));
    expect(screen.getByText("no toast")).toBeInTheDocument();
  });
});
