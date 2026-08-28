import { offlineConversionPipeline } from "./offline-conversion";
import { pacingReportPipeline } from "./pacing-report";
import type { PipelineDefinition } from "./types";
import { waterfallReportPipeline } from "./waterfall-report";

// Adding a future pipeline is a three-step config addition, not a
// rewrite: (1) write a new src/lib/pipelines/<name>.ts PipelineDefinition
// (per-firm or singleton), (2) add it to this array, (3) if per-firm, seed
// its roster into dashboard_firm_config the same way the others are
// seeded (see firm-config.ts's seedFirmConfigFromDefaults). No dashboard
// UI, API route, or engine code needs to change.
export const PIPELINES: PipelineDefinition[] = [
  offlineConversionPipeline,
  waterfallReportPipeline,
  pacingReportPipeline,
];

export function getPipeline(key: string): PipelineDefinition | undefined {
  return PIPELINES.find((p) => p.key === key);
}

export * from "./types";
export { runPipelineCheckup } from "./engine";
