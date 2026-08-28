// Shared firm-config shape, used by every pipeline definition under
// src/lib/pipelines/. Each pipeline's own roster (ACTIVE_FIRMS,
// PAUSED_FIRMS equivalents) lives in that pipeline's own file now --
// see src/lib/pipelines/offline-conversion.ts, pacing-report.ts.
export interface FirmConfig {
  slug: string;
  displayName: string;
}
