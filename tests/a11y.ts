import axe from "axe-core";

/** Runs axe-core on a rendered container and returns the violations (WCAG 2.x A/AA rules). */
export async function axeViolations(container: Element): Promise<axe.Result[]> {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    // Landmark/page-level rules need a full page, not a component fragment.
    // jsdom has no canvas or layout, so colour contrast is checked against the CSS palette instead.
    rules: { "color-contrast": { enabled: false }, region: { enabled: false }, "page-has-heading-one": { enabled: false }, "landmark-one-main": { enabled: false } },
  });
  return results.violations;
}
