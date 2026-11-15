import { addDays, dateRange, isValidTimeZone, localParts, tzOffsetMs, weekdayOf, zonedToUtc } from "./time";

describe("time helpers", () => {
  it.each([
    ["2026-11-15", "08:00", "Asia/Kolkata", "2026-11-15T02:30:00.000Z"],
    ["2026-11-15", "00:10", "Asia/Kolkata", "2026-11-14T18:40:00.000Z"],
    ["2026-11-15", "23:59", "UTC", "2026-11-15T23:59:00.000Z"],
    ["2026-07-01", "09:00", "America/New_York", "2026-07-01T13:00:00.000Z"],
    ["2026-01-15", "09:00", "America/New_York", "2026-01-15T14:00:00.000Z"],
  ])("zonedToUtc(%s %s %s) = %s", (date, time, tz, expected) => {
    expect(zonedToUtc(date, time, tz).toISOString()).toBe(expected);
  });

  it("localParts converts an instant to local date and time", () => {
    expect(localParts(new Date("2026-11-14T18:40:00Z"), "Asia/Kolkata")).toEqual({
      date: "2026-11-15",
      time: "00:10",
      weekday: 0,
    });
  });

  it("tzOffsetMs returns +5:30 for India", () => {
    expect(tzOffsetMs(Date.parse("2026-11-15T00:00:00Z"), "Asia/Kolkata")).toBe(19_800_000);
  });

  it.each([
    ["2026-11-15", 0],
    ["2026-11-16", 1],
    ["2026-11-21", 6],
  ])("weekdayOf(%s) = %i", (d, w) => expect(weekdayOf(d)).toBe(w));

  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("dateRange is inclusive", () => {
    expect(dateRange("2026-11-14", "2026-11-16")).toEqual(["2026-11-14", "2026-11-15", "2026-11-16"]);
    expect(dateRange("2026-11-16", "2026-11-14")).toEqual([]);
  });

  it("isValidTimeZone rejects unknown zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});
