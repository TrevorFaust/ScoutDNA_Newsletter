const SUPER_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** 1 → ¹, 12 → ¹² */
export function toSuperscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUPER_DIGITS[parseInt(d, 10)])
    .join("");
}

/** [1], [2] or (1) from model → ¹ ² */
export function normalizeInlineCitations(text: string): string {
  return text
    .replace(/\[(\d{1,2})\]/g, (_, num) => toSuperscript(parseInt(num, 10)))
    .replace(/\((\d{1,2})\)(?=\s|$|\.|,)/g, (_, num) => toSuperscript(parseInt(num, 10)));
}
