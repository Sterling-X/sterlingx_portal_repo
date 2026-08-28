import {
  ACTIVE_FIRMS,
  type FirmConfig,
  GADS_TARGETS,
  type GadsTarget,
} from "@/lib/accounts";
import { bigquery, tableExists } from "@/lib/bigquery";

const REPORT_PROJECT = "rc-datamart-report-082025";

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
  firm: string;
  displayName: string;
  checkedAt: string;
  verdict: Verdict;
  notes: string[];
  stages: StageResult[];
}

const FRESH_DAYS = 2;
const STALE_DAYS = 3;

// Preferred date columns to try, in order, per stage — origin lead table and
// conversion events use documented column names (see
// sterlingx-offline-conversion-agent.md Step 3/4), but a firm's table can
// drift, so this is checked against the live schema rather than assumed.
const DATE_COLUMN_CANDIDATES: Record<string, string[]> = {
  origin_lead: [
    "Origin_Date_Created",
    "CRM_Record_ID",
    "Conversion_Event_Date",
  ],
  conversion_events: ["Conversion_Event_Date", "Conversion_Upload_Date"],
  export_log: ["submitted_at", "finalised_at"],
  validation: ["submitted_at"],
};

async function resolveDateColumn(
  dataset: string,
  table: string,
  candidates: string[],
): Promise<string | null> {
  const [rows] = await bigquery.query({
    query: `
      SELECT column_name
      FROM \`${REPORT_PROJECT}.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @table
    `,
    params: { table },
  });
  const columns = new Set(
    rows.map((r: { column_name: string }) => r.column_name),
  );
  return candidates.find((c) => columns.has(c)) ?? null;
}

async function checkCountAndFreshness(
  dataset: string,
  table: string,
  stage: keyof typeof DATE_COLUMN_CANDIDATES,
  stageLabel: string,
): Promise<StageResult> {
  const tableRef = `${REPORT_PROJECT}.${dataset}.${table}`;
  const exists = await tableExists(dataset, table);
  if (!exists) {
    return {
      stage: stageLabel,
      tableRef,
      exists: false,
      rowCount: null,
      maxDate: null,
    };
  }

  const dateCol = await resolveDateColumn(
    dataset,
    table,
    DATE_COLUMN_CANDIDATES[stage],
  );
  const dateExpr = dateCol
    ? `MAX(CAST(${dateCol} AS TIMESTAMP))`
    : "CAST(NULL AS TIMESTAMP)";

  const [rows] = await bigquery.query({
    query: `SELECT COUNT(*) AS row_count, ${dateExpr} AS max_date FROM \`${tableRef}\``,
  });
  const row = rows[0] as {
    row_count: number;
    max_date: { value: string } | null;
  };

  return {
    stage: stageLabel,
    tableRef,
    exists: true,
    rowCount: Number(row.row_count),
    maxDate: row.max_date?.value ?? null,
    note: dateCol
      ? undefined
      : "no recognized date column found — freshness unknown",
  };
}

async function checkGadsExportLogs(firm: string): Promise<StageResult[]> {
  const results: StageResult[] = [];
  for (const target of GADS_TARGETS as readonly GadsTarget[]) {
    const table = `${firm}_ga_export_log_${target}`;
    const result = await checkCountAndFreshness(
      "gads_export_logs",
      table,
      "export_log",
      `gads_export_log[${target}]`,
    );
    results.push(result);
  }
  return results;
}

function daysSince(dateStr: string | null, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
}

function deriveVerdict(
  stages: StageResult[],
  now: Date,
): { verdict: Verdict; notes: string[] } {
  const notes: string[] = [];
  let verdict: Verdict = "green";

  const originLead = stages.find((s) => s.stage === "origin_lead_table");
  const conversionEvents = stages.find(
    (s) => s.stage === "origin_conversion_events",
  );
  const exportLogs = stages.filter((s) =>
    s.stage.startsWith("gads_export_log["),
  );
  const validation = stages.find((s) => s.stage === "validation_table");

  // Future-dated max is always a correctness bug, distinct from staleness.
  for (const s of stages) {
    if (s.maxDate && new Date(s.maxDate).getTime() > now.getTime()) {
      verdict = "red";
      notes.push(
        `${s.stage}: max date ${s.maxDate} is in the future — data correctness bug`,
      );
    }
  }

  if (!originLead?.exists || !conversionEvents?.exists) {
    verdict = verdict === "red" ? verdict : "red";
    notes.push(
      "core origin lead / conversion events table missing — structurally broken",
    );
    return { verdict, notes };
  }

  const originAge = daysSince(originLead.maxDate, now);
  const eventsAge = daysSince(conversionEvents.maxDate, now);

  for (const [label, age] of [
    ["origin_lead_table", originAge],
    ["origin_conversion_events", eventsAge],
  ] as const) {
    if (age === null) continue;
    if (age > 30) {
      verdict = "red";
      notes.push(
        `${label} stale by ${age.toFixed(0)} days — pipeline appears stalled`,
      );
    } else if (age > STALE_DAYS && verdict !== "red") {
      verdict = "yellow";
      notes.push(`${label} stale by ${age.toFixed(1)} days`);
    }
  }

  const builtLogs = exportLogs.filter((s) => s.exists);
  const missingLogs = exportLogs.filter((s) => !s.exists);

  if (builtLogs.length === 0) {
    if (verdict !== "red") verdict = "yellow";
    notes.push("no GAds export log targets built yet");
  } else {
    if (missingLogs.length > 0) {
      if (verdict !== "red") verdict = "yellow";
      notes.push(
        `${missingLogs.length} of ${GADS_TARGETS.length} GAds targets not built`,
      );
    }
    for (const log of builtLogs) {
      const age = daysSince(log.maxDate, now);
      if (age === null) continue;
      if (age > 21) {
        verdict = "red";
        notes.push(`${log.stage} stale by ${age.toFixed(0)} days`);
      } else if (age > STALE_DAYS && verdict !== "red") {
        verdict = "yellow";
        notes.push(`${log.stage} stale by ${age.toFixed(1)} days`);
      }
    }
  }

  if (!validation?.exists) {
    if (verdict !== "red") verdict = "yellow";
    notes.push("validation table not built");
  } else if (validation.rowCount === 0 && builtLogs.length > 0) {
    verdict = "red";
    notes.push(
      "validation table exists but has zero rows despite export logs existing",
    );
  }

  if (verdict === "green" && notes.length === 0) {
    notes.push("all stages present and fresh");
  }

  return { verdict, notes };
}

export async function checkupFirm(
  slug: string,
  displayName: string,
): Promise<FirmCheckupResult> {
  const now = new Date();

  const originLead = await checkCountAndFreshness(
    "firms_origin_lead_table",
    `${slug}_origin_lead_table`,
    "origin_lead",
    "origin_lead_table",
  );
  const conversionEvents = await checkCountAndFreshness(
    "firms_origin_conversion_events",
    `${slug}_origin_conversion_events`,
    "conversion_events",
    "origin_conversion_events",
  );
  const exportLogs = await checkGadsExportLogs(slug);
  const validation = await checkCountAndFreshness(
    "gads_validation_table",
    `${slug}_gads`,
    "validation",
    "validation_table",
  );

  const stages = [originLead, conversionEvents, ...exportLogs, validation];
  const { verdict, notes } = deriveVerdict(stages, now);

  return {
    firm: slug,
    displayName,
    checkedAt: now.toISOString(),
    verdict,
    notes,
    stages,
  };
}

export async function runFullCheckup(
  firms: FirmConfig[] = ACTIVE_FIRMS,
): Promise<FirmCheckupResult[]> {
  const results: FirmCheckupResult[] = [];
  for (const firm of firms) {
    try {
      results.push(await checkupFirm(firm.slug, firm.displayName));
    } catch (err) {
      results.push({
        firm: firm.slug,
        displayName: firm.displayName,
        checkedAt: new Date().toISOString(),
        verdict: "red",
        notes: [`checkup query failed: ${(err as Error).message}`],
        stages: [],
      });
    }
  }
  return results;
}

export { FRESH_DAYS };
