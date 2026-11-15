import { isNonDailySchedule } from "./frequency";

describe("isNonDailySchedule", () => {
  it.each([
    "Take once a week",
    "weekly",
    "60000 IU weekly after food",
    "Twice a week",
    "2 times per week",
    "three times a week",
    "on alternate days",
    "Alternate day",
    "every other day",
    "every second day",
    "every 3 days",
    "monthly",
    "once a month",
    "every Sunday",
    "on Mondays",
    "Mon only",
    "1 tab / week",
    "हफ्ते में एक बार",
    "हफ़्ते में दो बार",
    "सप्ताह में एक बार",
    "एक दिन छोड़कर",
    "महीने में एक बार",
  ])("flags %s as not daily", (text) => {
    expect(isNonDailySchedule(text)).toBe(true);
  });

  it.each([
    "",
    "once daily",
    "Once a day",
    "1 tablet at night",
    "twice daily after food",
    "1-0-1",
    "every day",
    "every morning",
    "Take 1 tablet in the morning before breakfast",
    "रोज़ सुबह खाने के बाद",
    "दिन में दो बार",
  ])("does not flag %s", (text) => {
    expect(isNonDailySchedule(text)).toBe(false);
  });
});
