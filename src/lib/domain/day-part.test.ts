import { dayPartOf, groupByDayPart, nextDose } from "./day-part";

describe("dayPartOf", () => {
  it.each([
    ["04:00", "morning"],
    ["08:00", "morning"],
    ["11:59", "morning"],
    ["12:00", "afternoon"],
    ["16:59", "afternoon"],
    ["17:00", "evening"],
    ["20:59", "evening"],
    ["21:00", "night"],
    ["23:59", "night"],
    ["00:00", "night"],
    ["03:59", "night"],
  ])("%s is %s", (time, part) => {
    expect(dayPartOf(time)).toBe(part);
  });

  it("rejects a bad time", () => {
    expect(() => dayPartOf("xx:00")).toThrow();
    expect(() => dayPartOf("24:00")).toThrow();
  });
});

describe("groupByDayPart", () => {
  it("groups in day order, keeps dose order and leaves out empty parts", () => {
    const doses = [
      { id: "a", time: "08:00" },
      { id: "b", time: "08:00" },
      { id: "c", time: "21:00" },
      { id: "d", time: "13:00" },
    ];
    expect(groupByDayPart(doses)).toEqual([
      { part: "morning", doses: [doses[0], doses[1]] },
      { part: "afternoon", doses: [doses[3]] },
      { part: "night", doses: [doses[2]] },
    ]);
  });

  it("returns an empty list for no doses", () => {
    expect(groupByDayPart([])).toEqual([]);
  });
});

describe("nextDose", () => {
  it("prefers a due dose, then the first upcoming one, else null", () => {
    expect(nextDose([{ state: "taken" }, { state: "upcoming", id: 1 }, { state: "due", id: 2 }])).toMatchObject({ id: 2 });
    expect(nextDose([{ state: "missed" }, { state: "upcoming", id: 3 }])).toMatchObject({ id: 3 });
    expect(nextDose([{ state: "taken" }, { state: "missed" }])).toBeNull();
  });
});
