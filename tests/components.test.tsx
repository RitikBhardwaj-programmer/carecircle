// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { DoseCard, type DoseCardProps } from "@/components/dose-card";
import { Field } from "@/components/field";
import { LoginForm } from "@/components/login-form";
import { emptyMedication, MedicationForm } from "@/components/medication-form";
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
