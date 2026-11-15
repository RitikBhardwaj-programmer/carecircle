import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the colour tokens from globals.css and checks WCAG contrast:
 * 7:1 for text pairs (1.4.6, AAA) and 3:1 for control borders and focus (1.4.11), in both modes.
 */
const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");

function block(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart);
  if (start < 0) throw new Error(`missing ${selectorStart}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]!] = m[2]!;
  return tokens;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const base = block(":root {");
const elder = { ...base, ...block("html.elder-mode,") };

const TEXT_PAIRS: Array<[string, string]> = [
  ["fg", "bg"],
  ["fg", "surface"],
  ["muted", "surface"],
  ["muted", "bg"],
  ["primary", "surface"],
  ["primary", "bg"],
  ["primary", "secondary-bg"],
  ["primary-fg", "primary"],
  ["primary-fg", "primary-hover"],
  ["ok", "surface"],
  ["ok", "ok-bg"],
  ["warn", "surface"],
  ["warn", "warn-bg"],
  ["danger", "surface"],
  ["danger", "danger-bg"],
  ["info", "info-bg"],
  ["fg", "warn-bg"],
  ["toast-fg", "toast-bg"],
  ["toast-action", "toast-bg"],
];
const CONTROL_PAIRS: Array<[string, string]> = [
  ["control-border", "surface"],
  ["control-border", "bg"],
  ["focus", "surface"],
  ["focus", "bg"],
];

describe.each([
  ["normal", base],
  ["Elder Mode", elder],
])("colour tokens in %s", (_name, tokens) => {
  it.each(TEXT_PAIRS)("text %s on %s reaches 7:1", (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(7);
  });
  it.each(CONTROL_PAIRS)("control %s on %s reaches 3:1", (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

it("contrast() matches the WCAG reference values", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
  expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
});
