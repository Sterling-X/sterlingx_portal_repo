export interface FirmConfig {
  slug: string;
  displayName: string;
}

// Firms actively checked by the offline-conversion reconciliation.
export const ACTIVE_FIRMS: FirmConfig[] = [
  { slug: "johnson", displayName: "Johnson Law Group" },
  { slug: "meyerpink", displayName: "Meyer Pink" },
  { slug: "auritmediation", displayName: "Aurit Mediation" },
  { slug: "lancaster", displayName: "Lancaster" },
  { slug: "cutrer", displayName: "Cutrer" },
  { slug: "kalishandjaggars", displayName: "Kalish & Jaggars" },
  { slug: "fanash", displayName: "Fanash Family Law" },
  { slug: "haffner", displayName: "Haffner Law" },
  { slug: "ireland", displayName: "Ireland" },
  { slug: "smb", displayName: "Scott M. Brown" },
];

// Firms excluded from automated tracking while under manual repair.
// Do not add a firm here without an explicit instruction — this list
// controls which accounts the checkup route skips querying entirely.
export const PAUSED_FIRMS: FirmConfig[] = [
  { slug: "tde", displayName: "The Drake Entity" },
  { slug: "vdl", displayName: "VDL" },
  { slug: "slo", displayName: "Sterling Lawyers (SLO)" },
];

export const GADS_TARGETS = [
  "consults_scheduled",
  "consults_complete",
  "funded_agreement",
  "qpc",
] as const;

export type GadsTarget = (typeof GADS_TARGETS)[number];
