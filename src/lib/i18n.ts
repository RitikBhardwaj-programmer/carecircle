import type { Language } from "./domain/types";

/** UI strings in English and Hindi. Keys are shared; missing Hindi falls back to English. */
const en = {
  appName: "CareCircle",
  tagline: "Elderly Care & Medication Management",
  navHome: "Today",
  navMedications: "Medications",
  navAppointments: "Appointments",
  navCircle: "Care circle",
  navActivity: "Activity",
  logout: "Log out",
  elderMode: "Elder Mode",
  todayTitle: "Today's medicines",
  noDoses: "No medicines scheduled today.",
  taken: "Taken",
  skip: "Skip",
  skipped: "Skipped",
  missed: "Missed",
  due: "Due now",
  upcoming: "Upcoming",
  markTaken: "I took it",
  markedTaken: "Marked as taken",
  allDone: "All medicines for today are done. Well done!",
  markedSkipped: "Marked as skipped",
  readAloud: "Read aloud",
  stopReading: "Stop reading",
  adherenceTitle: "Adherence",
  last7: "Last 7 days",
  last30: "Last 30 days",
  nextAppointments: "Upcoming appointments",
  noAppointments: "No upcoming appointments.",
  by: "by",
  at: "at",
  loading: "Loading…",
  retry: "Try again",
  notMedicalAdvice: "This is not medical advice. Ask your doctor or pharmacist.",
} as const;

export type MessageKey = keyof typeof en;

const hi: Partial<Record<MessageKey, string>> = {
  appName: "केयरसर्कल",
  tagline: "बुज़ुर्गों की देखभाल और दवा प्रबंधन",
  navHome: "आज",
  navMedications: "दवाइयाँ",
  navAppointments: "डॉक्टर से मुलाक़ात",
  navCircle: "देखभाल मंडली",
  navActivity: "गतिविधि",
  logout: "लॉग आउट",
  elderMode: "बुज़ुर्ग मोड",
  todayTitle: "आज की दवाइयाँ",
  noDoses: "आज कोई दवा नहीं है।",
  taken: "ले ली",
  skip: "छोड़ें",
  skipped: "छोड़ी गई",
  missed: "छूट गई",
  due: "अभी लेनी है",
  upcoming: "आने वाली",
  markTaken: "मैंने ले ली",
  markedTaken: "ले ली के रूप में दर्ज",
  allDone: "आज की सभी दवाइयाँ हो गईं। बहुत बढ़िया!",
  markedSkipped: "छोड़ी गई के रूप में दर्ज",
  readAloud: "पढ़कर सुनाएँ",
  stopReading: "रोकें",
  adherenceTitle: "नियमितता",
  last7: "पिछले 7 दिन",
  last30: "पिछले 30 दिन",
  nextAppointments: "आने वाली मुलाक़ातें",
  noAppointments: "कोई आने वाली मुलाक़ात नहीं।",
  by: "द्वारा",
  at: "समय",
  loading: "लोड हो रहा है…",
  retry: "फिर से कोशिश करें",
  notMedicalAdvice: "यह चिकित्सा सलाह नहीं है। अपने डॉक्टर या फार्मासिस्ट से पूछें।",
};

export function translate(lang: Language, key: MessageKey): string {
  return (lang === "hi" ? hi[key] : undefined) ?? en[key];
}

/** BCP-47 tag for the Speech Synthesis API and the `lang` attribute. */
export function speechLang(lang: Language): string {
  return lang === "hi" ? "hi-IN" : "en-IN";
}
