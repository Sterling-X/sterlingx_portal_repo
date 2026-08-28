import { APP_PROJECT, bigquery, tableExists } from "@/lib/bigquery";
import type {
  FirmConfigWithMatch,
  PerFirmPipelineDefinition,
} from "@/lib/pipelines";

const TABLE = `\`${APP_PROJECT}.pipeline_monitoring.dashboard_firm_config\``;

export interface EffectiveFirmConfig {
  active: FirmConfigWithMatch[];
  paused: FirmConfigWithMatch[];
}

// A pipeline's own defaultActiveFirms/defaultPausedFirms are the
// seed/fallback: if dashboard_firm_config doesn't exist yet (DDL not
// applied) or has no rows for this pipeline, behavior is unchanged from
// before this table existed. Once an admin edits the config via
// /admin/config, this table becomes the source of truth for that
// pipeline. matchValue isn't stored in the table (it's a query-time
// concern specific to how a pipeline's filterColumn stages work, not a
// tracking-state concern) -- rows loaded from the table are merged back
// against the pipeline's own default roster to recover it.
export async function getEffectiveFirmConfig(
  pipeline: PerFirmPipelineDefinition,
): Promise<EffectiveFirmConfig> {
  const exists = await tableExists(
    APP_PROJECT,
    "pipeline_monitoring",
    "dashboard_firm_config",
  );
  if (!exists) {
    return {
      active: pipeline.defaultActiveFirms,
      paused: pipeline.defaultPausedFirms,
    };
  }

  const [rows] = await bigquery.query({
    query: `SELECT slug, display_name, is_active FROM ${TABLE} WHERE pipeline_key = @pipelineKey`,
    params: { pipelineKey: pipeline.key },
  });

  if (rows.length === 0) {
    return {
      active: pipeline.defaultActiveFirms,
      paused: pipeline.defaultPausedFirms,
    };
  }

  const matchValueBySlug = new Map(
    [...pipeline.defaultActiveFirms, ...pipeline.defaultPausedFirms].map(
      (f) => [f.slug, f.matchValue],
    ),
  );

  const active: FirmConfigWithMatch[] = [];
  const paused: FirmConfigWithMatch[] = [];
  for (const row of rows) {
    const firm: FirmConfigWithMatch = {
      slug: row.slug as string,
      displayName: row.display_name as string,
      matchValue: matchValueBySlug.get(row.slug as string),
    };
    if (row.is_active) active.push(firm);
    else paused.push(firm);
  }
  return { active, paused };
}

export async function setFirmActive(
  pipelineKey: string,
  slug: string,
  displayName: string,
  isActive: boolean,
  updatedByEmail: string,
): Promise<void> {
  await bigquery.query({
    query: `
      MERGE ${TABLE} T
      USING (SELECT @pipelineKey AS pipeline_key, @slug AS slug) S
      ON T.pipeline_key = S.pipeline_key AND T.slug = S.slug
      WHEN MATCHED THEN
        UPDATE SET is_active = @isActive, updated_at = CURRENT_TIMESTAMP(),
                   updated_by = @updatedBy, display_name = @displayName
      WHEN NOT MATCHED THEN
        INSERT (pipeline_key, slug, display_name, is_active, updated_at, updated_by)
        VALUES (@pipelineKey, @slug, @displayName, @isActive, CURRENT_TIMESTAMP(), @updatedBy)
    `,
    params: {
      pipelineKey,
      slug,
      displayName,
      isActive,
      updatedBy: updatedByEmail,
    },
  });
}

// Seeds dashboard_firm_config from a pipeline's own hardcoded defaults,
// once, so the admin config page has starting rows to edit instead of an
// empty table. Safe to call repeatedly -- MERGE means it won't duplicate
// rows, and won't overwrite an admin's prior edits since callers only run
// this when the table has no rows for this pipeline yet.
export async function seedFirmConfigFromDefaults(
  pipeline: PerFirmPipelineDefinition,
  updatedByEmail: string,
): Promise<void> {
  for (const firm of pipeline.defaultActiveFirms) {
    await setFirmActive(
      pipeline.key,
      firm.slug,
      firm.displayName,
      true,
      updatedByEmail,
    );
  }
  for (const firm of pipeline.defaultPausedFirms) {
    await setFirmActive(
      pipeline.key,
      firm.slug,
      firm.displayName,
      false,
      updatedByEmail,
    );
  }
}
