import { fill, missingHindiKeys, translate } from "./i18n";

describe("i18n", () => {
  it("every English key has a Hindi text, so nothing falls back to English by accident", () => {
    expect(missingHindiKeys()).toEqual([]);
  });

  it("fills placeholders and keeps unknown ones", () => {
    expect(fill(translate("en", "savedName"), { name: "Aspirin" })).toBe("Saved Aspirin");
    expect(fill(translate("hi", "savedName"), { name: "Aspirin" })).toBe("Aspirin सेव हो गई");
    expect(fill("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});
