/** Position hues and badge classes (matches DraftDNA spreadsheet chips). */

export type FantasyPosition =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "K"
  | "DEF"
  | "OL"
  | "COACH"
  | "OTHER";

const DEF_POSITIONS = new Set([
  "DEF",
  "D/ST",
  "DST",
  "DB",
  "CB",
  "S",
  "SS",
  "FS",
  "SAF",
  "LB",
  "ILB",
  "OLB",
  "MLB",
  "EDGE",
  "DE",
  "DT",
  "NT",
  "DL",
  "LDE",
  "RDE",
  "LILB",
  "RILB",
  "SLB",
  "WLB",
  "LCB",
  "RCB",
  "NB",
]);

const OL_POSITIONS = new Set([
  "OL",
  "T",
  "G",
  "C",
  "OT",
  "OG",
  "IOL",
  "LT",
  "RT",
  "LG",
  "RG",
]);

export function normalizePosition(raw: string | null | undefined): FantasyPosition | null {
  const pos = (raw || "").trim().toUpperCase();
  if (!pos) return null;
  if (
    pos === "COACH" ||
    pos === "HC" ||
    pos === "OC" ||
    pos === "DC" ||
    pos === "GM" ||
    pos === "STC" ||
    pos === "ST" ||
    pos === "ASST" ||
    pos === "ASSISTANT" ||
    pos === "OWNER" ||
    pos === "PRESIDENT" ||
    pos === "OTHER" ||
    pos === "MEDIA" ||
    pos === "REPORTER"
  ) {
    if (pos === "OTHER" || pos === "MEDIA" || pos === "REPORTER") return "OTHER";
    return "COACH";
  }
  if (pos === "FB") return "RB";
  if (OL_POSITIONS.has(pos)) return "OL";
  if (DEF_POSITIONS.has(pos) || pos.startsWith("DEF")) return "DEF";
  if (pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE" || pos === "K") {
    return pos;
  }
  return null;
}

export function getPositionBadgeClass(position: string): string {
  const norm = normalizePosition(position);
  switch (norm) {
    case "QB":
      return "position-qb";
    case "RB":
      return "position-rb";
    case "WR":
      return "position-wr";
    case "TE":
      return "position-te";
    case "K":
      return "position-k";
    case "DEF":
      return "position-def";
    case "OL":
      return "position-ol";
    case "COACH":
      return "position-coach";
    case "OTHER":
      return "position-other";
    default:
      return "position-unknown";
  }
}

export function normalizePlayerKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+jr\.?$/i, "")
    .replace(/\s+sr\.?$/i, "")
    .replace(/\s+ii$/i, "")
    .replace(/\s+iii$/i, "")
    .replace(/[^a-z0-9]/g, "");
}
