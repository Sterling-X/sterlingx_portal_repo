import type { FirmConfig } from "@/lib/accounts";

export type Verdict = "green" | "yellow" | "red";

export interface StageResult {
  stage: string;
  tableRef: string | null;
  exists: boolean;
  rowCount: number | null;
  maxDate: string | null;
  note?: string;
}

export interface FirmCheckupResult {
  pipeline: string;
  firm: string;
  displayName: string;
  checkedAt: string;
  verdict: Verdict;
  notes: string[];
  stages: StageResult[];
}

// A stage's table name may depend on the firm being checked ("{firm}" is
// replaced with the firm slug) or be fixed (singleton pipelines, or a
// per-firm pipeline stage that reads a shared table -- see
// pacing-report.ts's note on why its upstream stage was dropped rather
// than templated).
export interface StageDefinition {
  project: string;
  dataset: string;
  tablePattern: string; // may contain "{firm}"
  stageLabel: string;
  dateColumnCandidates: string[];
  // Only meaningful for per-firm pipelines: additionally filter the
  // freshness/count query by this column matching the firm's `matchValue`
  // (e.g. Pacing's shared final table has one row per firm distinguished
  // by client_name, not a per-firm table).
  filterColumn?: string;
  // A missing table for an optional stage degrades the aggregate verdict
  // to yellow ("not built yet"), not red ("broken") -- e.g. Offline
  // Conversion's GAds export-log targets and validation table are
  // legitimately absent for a firm mid-onboarding. Core stages (the
  // origin lead table, conversion events) are non-optional: missing
  // there is a real break, not an incomplete build.
  optional?: boolean;
}

export interface FirmConfigWithMatch extends FirmConfig {
  // Value used for a stage's `filterColumn`, when a stage reads a shared
  // table filtered per-firm instead of a genuinely per-firm table. Falls
  // back to displayName when a stage needs filtering but no matchValue is
  // set.
  matchValue?: string;
}

interface PipelineBase {
  key: string;
  displayName: string;
  description: string;
}

export interface PerFirmPipelineDefinition extends PipelineBase {
  shape: "per-firm";
  stages: StageDefinition[];
  // Default roster, used only as a seed/fallback -- see firm-config.ts,
  // same pattern as the original accounts.ts for Offline Conversion.
  defaultActiveFirms: FirmConfigWithMatch[];
  defaultPausedFirms: FirmConfigWithMatch[];
}

export interface SingletonPipelineDefinition extends PipelineBase {
  shape: "singleton";
  stages: StageDefinition[];
}

export type PipelineDefinition =
  | PerFirmPipelineDefinition
  | SingletonPipelineDefinition;
