/**
 * Structured JSON logger. Cloud Logging parses one JSON object per line and reads `severity`.
 * Never pass passcodes, tokens, email addresses or medical text here.
 */
type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(severity: Severity, message: string, fields: Fields = {}): void {
  if (process.env.NODE_ENV === "test" && severity !== "ERROR") return;
  const line = JSON.stringify({ severity, message, time: new Date().toISOString(), ...fields });
  const stream = severity === "ERROR" || severity === "WARNING" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export const logger = {
  info: (message: string, fields?: Fields) => write("INFO", message, fields),
  warn: (message: string, fields?: Fields) => write("WARNING", message, fields),
  error: (message: string, fields?: Fields) => write("ERROR", message, fields),
};
