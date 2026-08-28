import { REPORT_PROJECT } from "@/lib/bigquery";
import type { SingletonPipelineDefinition } from "./types";

// Not per-firm -- one shared linear pipeline feeding a single combined
// Looker Studio report for every firm at once. Verified live this
// session (schema queries against rc-datamart-report-082025): all four
// tables live in genesis_looker_crm_ctp_universal_table, dated by
// `metric_date` (DATE) except the trunk table, which is dated by
// `Lead_Create_Date` (TIMESTAMP) — the same trunk Offline Conversion's
// upstream reads, checked independently here per its own freshness.
export const waterfallReportPipeline: SingletonPipelineDefinition = {
  key: "waterfall_report",
  displayName: "Waterfall Report",
  description:
    "CRM/CTP trunk → base metrics → combined calculations → Looker Studio report",
  shape: "singleton",
  stages: [
    {
      project: REPORT_PROJECT,
      dataset: "genesis_looker_crm_ctp_universal_table",
      tablePattern: "genesis_crm_ctp_universal_table",
      stageLabel: "genesis_crm_ctp_universal_table",
      dateColumnCandidates: ["Lead_Create_Date"],
    },
    {
      project: REPORT_PROJECT,
      dataset: "genesis_looker_crm_ctp_universal_table",
      tablePattern: "tmp_historical_base",
      stageLabel: "waterfall_base",
      dateColumnCandidates: ["metric_date"],
    },
    {
      project: REPORT_PROJECT,
      dataset: "genesis_looker_crm_ctp_universal_table",
      tablePattern: "tmp_historical_combined",
      stageLabel: "waterfall_combine_calculations",
      dateColumnCandidates: ["metric_date"],
    },
    {
      project: REPORT_PROJECT,
      dataset: "genesis_looker_crm_ctp_universal_table",
      tablePattern: "genesis_historical_waterfallreport",
      stageLabel: "lookerstudio_final_waterfallreport",
      dateColumnCandidates: ["metric_date"],
    },
  ],
};
