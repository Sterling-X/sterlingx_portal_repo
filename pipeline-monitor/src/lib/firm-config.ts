import { ACTIVE_FIRMS, type FirmConfig, PAUSED_FIRMS } from "@/lib/accounts";
import { APP_PROJECT, bigquery, tableExists } from "@/lib/bigquery";

const TABLE = `\`${APP_PROJECT}.pipeline_monitoring.dashboard_firm_config\``;

export interface EffectiveFirmConfig {
  active: FirmConfig[];
  paused: FirmConfig[];
}

// The hardcoded lists in accounts.ts are the seed/fallback: if
// dashboard_firm_config doesn't exist yet (DDL not applied) or has no
// rows, behavior is unchanged from before this table existed. Once an
// admin edits the config via /admin/config, this table becomes the
// source of truth.
export async function getEffectiveFirmConfig(): Promise<EffectiveFirmConfig> {
  const exists = await tableExists(
    APP_PROJECT,
    "pipeline_monitoring",
    "dashboard_firm_config",
  );
  if (!exists) {
    return { active: ACTIVE_FIRMS, paused: PAUSED_FIRMS };
  }

  const [rows] = await bigquery.query({
    query: `SELECT slug, display_name, is_active FROM ${TABLE}`,
  });

  if (rows.length === 0) {
    return { active: ACTIVE_FIRMS, paused: PAUSED_FIRMS };
  }

  const active: FirmConfig[] = [];
  const paused: FirmConfig[] = [];
  for (const row of rows) {
    const firm: FirmConfig = {
      slug: row.slug as string,
      displayName: row.display_name as string,
    };
    if (row.is_active) active.push(firm);
    else paused.push(firm);
  }
  return { active, paused };
}

export async function setFirmActive(
  slug: string,
  displayName: string,
  isActive: boolean,
  updatedByEmail: string,
): Promise<void> {
  await bigquery.query({
    query: `
      MERGE ${TABLE} T
      USING (SELECT @slug AS slug) S
      ON T.slug = S.slug
      WHEN MATCHED THEN
        UPDATE SET is_active = @isActive, updated_at = CURRENT_TIMESTAMP(),
                   updated_by = @updatedBy, display_name = @displayName
      WHEN NOT MATCHED THEN
        INSERT (slug, display_name, is_active, updated_at, updated_by)
        VALUES (@slug, @displayName, @isActive, CURRENT_TIMESTAMP(), @updatedBy)
    `,
    params: {
      slug,
      displayName,
      isActive,
      updatedBy: updatedByEmail,
    },
  });
}

// Seeds dashboard_firm_config from accounts.ts's hardcoded lists, once,
// so the admin config page has starting rows to edit instead of an empty
// table. Safe to call repeatedly -- MERGE means it won't duplicate rows,
// and won't overwrite an admin's prior edits since it only runs when the
// table is empty (checked by the caller).
export async function seedFirmConfigFromDefaults(
  updatedByEmail: string,
): Promise<void> {
  for (const firm of ACTIVE_FIRMS) {
    await setFirmActive(firm.slug, firm.displayName, true, updatedByEmail);
  }
  for (const firm of PAUSED_FIRMS) {
    await setFirmActive(firm.slug, firm.displayName, false, updatedByEmail);
  }
}
