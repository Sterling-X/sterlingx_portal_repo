import { APP_PROJECT } from "@/lib/bigquery";
import type { FirmConfigWithMatch, PerFirmPipelineDefinition } from "./types";

// 19 firms -- confirmed this session by reading every .sqlx file's actual
// `CREATE OR REPLACE TABLE` target (not guessed from filenames, which
// sometimes differ from the table slug -- e.g. drake_law_firm, not
// drake_law) in sterlingx_portal_repo's definitions/firm_weekly_roundup/
// and definitions/kevin_build/firm_weekly_roundup/. matchValue is the
// exact client_name string as it actually appears in
// sterlingx-insights.all_clients.Client_Weekly_Pacing_Roundup (confirmed
// live via a DISTINCT query) -- deliberately kept as-is even where it
// looks inconsistent (e.g. "Bruce law" lowercase, "Fanash" vs the
// weekly-roundup table's "fanish" slug, "Scott M Brown" with no period)
// rather than silently "fixed", since the filter has to match the real
// stored value exactly or the presence check will always report zero.
const FIRMS: FirmConfigWithMatch[] = [
  {
    slug: "arizona_family_law",
    displayName: "Arizona Family Law",
    matchValue: "Arizona Family Law",
  },
  { slug: "bruce_law", displayName: "Bruce Law", matchValue: "Bruce law" },
  { slug: "cutrer", displayName: "Cutrer", matchValue: "Cutrer" },
  {
    slug: "drake_law_firm",
    displayName: "Drake Law Firm",
    matchValue: "Drake Law Firm",
  },
  {
    slug: "fanish_family_law",
    displayName: "Fanash Family Law",
    matchValue: "Fanash Family Law",
  },
  {
    slug: "gjesdahl_law",
    displayName: "Gjesdahl Law",
    matchValue: "Gjesdahl Law",
  },
  {
    slug: "haffner_law",
    displayName: "Haffner Law",
    matchValue: "Haffner Law",
  },
  {
    slug: "ireland",
    displayName: "Michael Ireland & Associates",
    matchValue: "Michael Ireland & Associates",
  },
  {
    slug: "johnson_law_group",
    displayName: "Johnson Law Group",
    matchValue: "Johnson Law Group",
  },
  {
    slug: "kalish_and_jaggars",
    displayName: "Kalish & Jaggars",
    matchValue: "Kalish and Jaggars",
  },
  { slug: "lafrance", displayName: "LaFrance", matchValue: "LaFrance" },
  { slug: "lancaster", displayName: "Lancaster", matchValue: "Lancaster" },
  { slug: "meyer_pink", displayName: "Meyer Pink", matchValue: "Meyer Pink" },
  {
    slug: "ramage_law",
    displayName: "The Ramage Law Group",
    matchValue: "The Ramage Law Group",
  },
  {
    slug: "sterling_lawyers",
    displayName: "Sterling Lawyers",
    matchValue: "Sterling Lawyers",
  },
  {
    slug: "aurit_mediation",
    displayName: "Aurit Mediation",
    matchValue: "Aurit Mediation",
  },
  {
    slug: "scott_m_brown",
    displayName: "Scott M. Brown",
    matchValue: "Scott M Brown",
  },
  { slug: "tde", displayName: "TDE Family Law", matchValue: "TDE Family Law" },
  { slug: "vdl", displayName: "VDL", matchValue: "VDL" },
];

export const pacingReportPipeline: PerFirmPipelineDefinition = {
  key: "pacing_report",
  displayName: "Pacing Report",
  description: "Per-firm weekly roundup → combined client pacing roundup",
  shape: "per-firm",
  defaultActiveFirms: FIRMS,
  defaultPausedFirms: [],
  stages: [
    // Note: the directive for this build assumed a genuinely per-firm
    // upstream source table (`{firm}_crm_ctp_universal_table`). Verified
    // live this session that's only true for Ireland -- every other firm's
    // weekly-roundup .sqlx reads the *shared* genesis_crm_ctp_universal_table
    // (filtered internally by Firm_Name), the same trunk Waterfall Report
    // checks. Querying that same non-firm-specific table 19 times per
    // checkup run, presented as if it were per-firm, would be both
    // wasteful and misleading -- so that stage is intentionally dropped
    // here. Waterfall Report's own check already covers this trunk's
    // freshness; a firm-level gap upstream of the weekly roundup will
    // still surface below, since the weekly roundup itself would go stale.
    {
      project: APP_PROJECT,
      dataset: "firm_weekly_roundup_table",
      tablePattern: "{firm}_weekly_roundup_table",
      stageLabel: "firm_weekly_roundup_table",
      dateColumnCandidates: ["week_starting"],
    },
    {
      project: APP_PROJECT,
      dataset: "all_clients",
      tablePattern: "Client_Weekly_Pacing_Roundup",
      stageLabel: "client_weekly_pacing_roundup",
      dateColumnCandidates: ["week_starting"],
      filterColumn: "client_name",
    },
  ],
};
