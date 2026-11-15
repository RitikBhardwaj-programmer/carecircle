// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { DoseCard, type DoseCardProps } from "@/components/dose-card";
import { Field } from "@/components/field";
import { LoginForm } from "@/components/login-form";
import { emptyMedication, friendlyFieldErrors, MedicationForm } from "@/components/medication-form";
import { translate } from "@/lib/i18n";
import { axeViolations } from "./a11y";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const t = (k: Parameters<typeof translate>[1]) => translate("en", k);

const dose: DoseCardProps["dose"] = {
  id: "med-1_2026-11-15_0800",
  name: "Metformin",
  dosage: "500 mg",
  instructions: "After food",
  time: "08:00",
  state: "due",
  loggedBy: null,
};

describe("DoseCard (R4, R11)", () => {
  it("has no axe violations and calls onMark with the dose id", async () => {
    const onMark = vi.fn();
    const { container } = render(<DoseCard dose={dose} canWrite t={t} onMark={onMark} />);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Taken" }));
    expect(onMark).toHaveBeenCalledWith(dose.id, "taken");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onMark).toHaveBeenCalledWith(dose.id, "skipped");
  });

  it("Elder Mode shows one large 'I took it' button and no skip", async () => {
    const { container } = render(<DoseCard dose={dose} canWrite large t={t} onMark={vi.fn()} />);
    expect(screen.getByRole("button", { name: "I took it" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("shows state as text, not only colour, and hides buttons for view-only or logged doses", () => {
    render(<DoseCard dose={{ ...dose, state: "taken", loggedBy: "Ravi" }} canWrite t={t} onMark={vi.fn()} />);
    expect(screen.getByText(/Taken · by Ravi/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    render(<DoseCard dose={{ ...dose, state: "missed" }} canWrite={false} t={t} onMark={vi.fn()} />);
    expect(screen.getByText(/Missed/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses Hindi strings when the language is Hindi", () => {
    render(<DoseCard dose={dose} canWrite large t={(k) => translate("hi", k)} onMark={vi.fn()} />);
    expect(screen.getByRole("button", { name: "मैंने ले ली" })).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("links the error to the input with aria-describedby", () => {
    render(<Field label="Name" error="Required" hint="Your full name" />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Your full name Required");
  });
});

describe("LoginForm (R1)", () => {
  it("is accessible and shows the server error in an alert", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Profile code or passcode is incorrect." } }), {
        status: 401,
      }),
    );
    const onSuccess = vi.fn();
    const { container } = render(<LoginForm onSuccess={onSuccess} />);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.change(screen.getByLabelText("Profile code"), { target: { value: "CARE-AAAA-BBBB" } });
    fireEvent.change(screen.getByLabelText(/Your passcode/), { target: { value: "WRONGPWD" } });
    fireEvent.click(screen.getByRole("button", { name: "Open profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Profile code or passcode is incorrect.");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls onSuccess after a good login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: "Open profile" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});

describe("MedicationForm (R3)", () => {
  it("is accessible, supports adding times and submits the values", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <MedicationForm initial={emptyMedication("2026-11-15")} title="Add medication" submitLabel="Confirm and save" onSubmit={onSubmit} />,
    );
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Amlodipine" } });
    fireEvent.change(screen.getByLabelText(/^Dosage/), { target: { value: "5 mg" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a time" }));
    fireEvent.click(screen.getByLabelText("Mon"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Amlodipine", dosage: "5 mg", times: ["08:00", "20:00"], days: [1], startDate: "2026-11-15" }),
    );
  });

  it("shows field errors from the server next to the inputs", () => {
    render(
      <MedicationForm
        initial={emptyMedication("2026-11-15")}
        title="Add medication"
        submitLabel="Save"
        fields={{ name: "Too small: expected string to have >=1 characters" }}
        error="Please check the highlighted fields."
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Medicine name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
  });
});

describe("DoseCard Undo (Change button)", () => {
  it("shows when the dose was marked and a Change button that reopens it", async () => {
    const onUndo = vi.fn();
    const { container } = render(
      <DoseCard
        dose={{ ...dose, state: "taken", loggedBy: "Ravi", loggedAt: "2026-11-15T02:35:00.000Z" }}
        canWrite
        timeZone="Asia/Kolkata"
        t={t}
        onMark={vi.fn()}
        onUndo={onUndo}
      />,
    );
    expect(screen.getByText(/Taken · by Ravi · 08:05/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onUndo).toHaveBeenCalledWith(dose.id);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("MedicationForm time chips (Stage 4)", () => {
  it("groups the form in three steps and a time chip adds or removes that time", async () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <MedicationForm initial={emptyMedication("2026-11-15")} title="Add medication" submitLabel="Save" onSubmit={onSubmit} />,
    );
    expect(screen.getByRole("group", { name: /What is the medicine\?/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /When is it taken\?/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /For how long\?/ })).toBeInTheDocument();
    const morning = screen.getByRole("button", { name: "Morning 08:00" });
    expect(morning).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Night 21:00" }));
    fireEvent.click(morning); // removes 08:00, since another time is left
    fireEvent.change(screen.getByLabelText("Medicine name"), { target: { value: "Atorvastatin" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ times: ["21:00"] }));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("friendlyFieldErrors (design review)", () => {
  it("turns raw validation text into a sentence that says how to fix it", () => {
    expect(
      friendlyFieldErrors({
        name: "Too small: expected string to have >=1 characters",
        "times.0": "Use HH:mm (24 h)",
        endDate: "End date must be on or after start date",
      }),
    ).toEqual({ name: "Enter the medicine name.", "times.0": "Use a time like 08:00.", endDate: "End date must be on or after start date" });
  });

  it("the form shows the friendly text next to the input", () => {
    render(
      <MedicationForm
        initial={emptyMedication("2026-11-15")}
        title="Add medication"
        submitLabel="Save"
        fields={{ name: "Too small: expected string to have >=1 characters" }}
        error="Please check the highlighted fields."
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Medicine name")).toHaveAccessibleDescription("Enter the medicine name.");
  });
});
