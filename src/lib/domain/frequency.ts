/**
 * Safety net for scanned prescriptions that does not depend on the model:
 * does a medicine's text say it is NOT taken every day (weekly, alternate days, monthly, ...)?
 * Used to stop a "once a week" medicine from being saved as "every day".
 */
const NON_DAILY: RegExp[] = [
  /\bweekly\b/i,
  /\bfortnightly\b/i,
  /\bmonthly\b/i,
  /\b(once|twice|thrice|one|two|three|\d+)\s*(times?\s*)?(a|per|in a|every)\s*(week|month)\b/i,
  /\bevery\s+(week|month|other\s+day|second\s+day|2nd\s+day|third\s+day|3rd\s+day|\d+\s+days)\b/i,
  /\balternate\s+days?\b/i,
  /\bon\s+alternate\b/i,
  /\b(every|each|on)\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(day)?s?\b/i,
  /\b(sun|mon|tue|wed|thu|fri|sat)(day)?s?\s+only\b/i,
  /\bper\s+week\b/i,
  /\/\s*(week|wk)\b/i,
  // Hindi
  /हफ़्ते|हफ्ते|हफ़्ता|हफ्ता|सप्ताह/,
  /महीने|माह/,
  /एक\s*दिन\s*छोड़\s*कर|एक\s*दिन\s*छोड़कर|दिन\s*छोड़\s*कर/,
];

/** True when the text says the medicine is taken less often than every day. */
export function isNonDailySchedule(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  return NON_DAILY.some((re) => re.test(s));
}
