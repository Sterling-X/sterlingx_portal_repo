import { REPORT_PROJECT } from "@/lib/bigquery";
import type { PerFirmPipelineDefinition, StageDefinition } from "./types";

// Firms actively checked. Unchanged from the original accounts.ts list --
// same 10 firms, same 3 paused (tde/vdl/slo), just relocated under the
// new per-pipeline shape.
const ACTIVE_FIRMS = [
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

const PAUSED_FIRMS = [
  { slug: "tde", displayName: "The Drake Entity" },
  { slug: "vdl", displayName: "VDL" },
  { slug: "slo", displayName: "Sterling Lawyers (SLO)" },
];

const GADS_TARGETS = [
  "consults_scheduled",
  "consults_complete",
  "funded_agreement",
  "qpc",
] as const;

const gadsExportLogStages: StageDefinition[] = GADS_TARGETS.map((target) => ({
  project: REPORT_PROJECT,
  dataset: "gads_export_logs",
  tablePattern: `{firm}_ga_export_log_${target}`,
  stageLabel: `gads_export_log[${target}]`,
  dateColumnCandidates: ["submitted_at", "finalised_at"],
  optional: true,
}));

export const offlineConversionPipeline: PerFirmPipelineDefinition = {
  key: "offline_conversion",
  displayName: "Offline Conversion",
  description:
    "Source → origin lead → conversion events → Google Ads, per firm",
  shape: "per-firm",
  defaultActiveFirms: ACTIVE_FIRMS,
  defaultPausedFirms: PAUSED_FIRMS,
  stages: [
    {
      project: REPORT_PROJECT,
      dataset: "firms_origin_lead_table",
      tablePattern: "{firm}_origin_lead_table",
      stageLabel: "origin_lead_table",
      dateColumnCandidates: [
        "Origin_Date_Created",
        "CRM_Record_ID",
        "Conversion_Event_Date",
      ],
    },
    {
      project: REPORT_PROJECT,
      dataset: "firms_origin_conversion_events",
      tablePattern: "{firm}_origin_conversion_events",
      stageLabel: "origin_conversion_events",
      dateColumnCandidates: ["Conversion_Event_Date", "Conversion_Upload_Date"],
    },
    ...gadsExportLogStages,
    {
      project: REPORT_PROJECT,
      dataset: "gads_validation_table",
      tablePattern: "{firm}_gads",
      stageLabel: "validation_table",
      dateColumnCandidates: ["submitted_at"],
      optional: true,
    },
  ],
};
