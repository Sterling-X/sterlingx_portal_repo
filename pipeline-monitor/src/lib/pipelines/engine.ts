import { bigquery, tableExists } from "@/lib/bigquery";
import { deriveDateFreshnessVerdict } from "./anomaly";
import type {
  FirmCheckupResult,
  FirmConfigWithMatch,
  PerFirmPipelineDefinition,
  PipelineDefinition,
  SingletonPipelineDefinition,
  StageDefinition,
  StageResult,
  Verdict,
} from "./types";

async function resolveDateColumn(
  project: string,
  dataset: string,
  table: string,
  candidates: string[],
): Promise<string | null> {
  const [rows] = await bigquery.query({
    query: `
      SELECT column_name
      FROM \`${project}.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @table
    `,
    params: { table },
  });
  const columns = new Set(
    rows.map((r: { column_name: string }) => r.column_name),
  );
  return candidates.find((c) => columns.has(c)) ?? null;
}

function resolveTable(pattern: string, firm?: string): string {
  return firm ? pattern.replaceAll("{firm}", firm) : pattern;
}

interface StageCheckOptions {
  filterValue?: string; // paired with StageDefinition.filterColumn
  // When set, also fetches a daily-grouped count series (for the
  // per-firm anomaly logic in anomaly.ts) instead of just a single
  // COUNT(*)/MAX(date) — set for per-firm pipelines, unset for
  // singleton pipelines (which use the simpler staleness check).
  withDailySeries?: boolean;
}

interface StageCheckResult {
  result: StageResult;
  dailyCounts: { date: string; count: number }[] | null;
}

async function checkStage(
  stage: StageDefinition,
  firm: string | undefined,
  opts: StageCheckOptions,
): Promise<StageCheckResult> {
  const table = resolveTable(stage.tablePattern, firm);
  const tableRef = `${stage.project}.${stage.dataset}.${table}`;
  const exists = await tableExists(stage.project, stage.dataset, table);
  if (!exists) {
    return {
      result: {
        stage: stage.stageLabel,
        tableRef,
        exists: false,
        rowCount: null,
        maxDate: null,
      },
      dailyCounts: null,
    };
  }

  const dateCol = await resolveDateColumn(
    stage.project,
    stage.dataset,
    table,
    stage.dateColumnCandidates,
  );

  const filterClause =
    stage.filterColumn && opts.filterValue
      ? `WHERE ${stage.filterColumn} = @filterValue`
      : "";
  const params =
    stage.filterColumn && opts.filterValue
      ? { filterValue: opts.filterValue }
      : {};

  if (!dateCol) {
    const [rows] = await bigquery.query({
      query: `SELECT COUNT(*) AS row_count FROM \`${tableRef}\` ${filterClause}`,
      params,
    });
    const row = rows[0] as { row_count: number };
    return {
      result: {
        stage: stage.stageLabel,
        tableRef,
        exists: true,
        rowCount: Number(row.row_count),
        maxDate: null,
        note: "no recognized date column found — freshness unknown",
      },
      dailyCounts: null,
    };
  }

  const dateExpr = `CAST(${dateCol} AS TIMESTAMP)`;
  const [totalsRows] = await bigquery.query({
    query: `
      SELECT COUNT(*) AS row_count, MAX(${dateExpr}) AS max_date
      FROM \`${tableRef}\` ${filterClause}
    `,
    params,
  });
  const totals = totalsRows[0] as {
    row_count: number;
    max_date: { value: string } | null;
  };

  let dailyCounts: { date: string; count: number }[] | null = null;
  if (opts.withDailySeries) {
    const dailyWhere = filterClause
      ? `${filterClause} AND ${dateExpr} >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 70 DAY)`
      : `WHERE ${dateExpr} >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 70 DAY)`;
    const [dailyRows] = await bigquery.query({
      query: `
        SELECT DATE(${dateExpr}) AS d, COUNT(*) AS c
        FROM \`${tableRef}\`
        ${dailyWhere}
        GROUP BY d
      `,
      params,
    });
    dailyCounts = (dailyRows as { d: { value: string }; c: number }[]).map(
      (r) => ({
        date: r.d.value,
        count: Number(r.c),
      }),
    );
  }

  return {
    result: {
      stage: stage.stageLabel,
      tableRef,
      exists: true,
      rowCount: Number(totals.row_count),
      maxDate: totals.max_date?.value ?? null,
    },
    dailyCounts,
  };
}

// Aggregates per-stage verdicts into one overall verdict for a firm/
// singleton result. A stage carries its own verdict + note (computed by
// the anomaly logic for per-firm pipelines, or the simpler check below
// for singleton pipelines) — this just takes the worst of all stages,
// plus the always-on future-date correctness check and the
// missing-table check.
function aggregateVerdict(
  stageVerdicts: {
    stage: StageResult;
    verdict: Verdict;
    note: string;
    optional?: boolean;
  }[],
  now: Date,
): { verdict: Verdict; notes: string[] } {
  const notes: string[] = [];
  let verdict: Verdict = "green";
  const rank: Record<Verdict, number> = { green: 0, yellow: 1, red: 2 };

  for (const { stage, verdict: v, note, optional } of stageVerdicts) {
    if (!stage.exists) {
      const missingVerdict: Verdict = optional ? "yellow" : "red";
      if (rank[missingVerdict] > rank[verdict]) verdict = missingVerdict;
      notes.push(
        optional
          ? `${stage.stage}: not built yet`
          : `${stage.stage}: table missing`,
      );
      continue;
    }
    if (stage.maxDate && new Date(stage.maxDate).getTime() > now.getTime()) {
      verdict = "red";
      notes.push(
        `${stage.stage}: max date ${stage.maxDate} is in the future — data correctness bug`,
      );
      continue;
    }
    if (rank[v] > rank[verdict]) verdict = v;
    if (v !== "green") notes.push(`${stage.stage}: ${note}`);
  }

  if (verdict === "green" && notes.length === 0) {
    notes.push("all stages present and fresh");
  }
  return { verdict, notes };
}

async function checkupPerFirmPipeline(
  def: PerFirmPipelineDefinition,
  firms: FirmConfigWithMatch[],
): Promise<FirmCheckupResult[]> {
  const results: FirmCheckupResult[] = [];
  for (const firm of firms) {
    const now = new Date();
    try {
      const stageVerdicts: {
        stage: StageResult;
        verdict: Verdict;
        note: string;
        optional?: boolean;
      }[] = [];
      for (const stageDef of def.stages) {
        const { result, dailyCounts } = await checkStage(stageDef, firm.slug, {
          filterValue: stageDef.filterColumn
            ? (firm.matchValue ?? firm.displayName)
            : undefined,
          withDailySeries: true,
        });
        if (!result.exists) {
          stageVerdicts.push({
            stage: result,
            verdict: stageDef.optional ? "yellow" : "red",
            note: stageDef.optional ? "not built yet" : "table missing",
            optional: stageDef.optional,
          });
          continue;
        }
        const { verdict, note } = dailyCounts
          ? deriveDateFreshnessVerdict(dailyCounts, now)
          : {
              verdict: "yellow" as Verdict,
              note: result.note ?? "no date column — freshness unknown",
            };
        stageVerdicts.push({
          stage: result,
          verdict,
          note,
          optional: stageDef.optional,
        });
      }
      const { verdict, notes } = aggregateVerdict(stageVerdicts, now);
      results.push({
        pipeline: def.key,
        firm: firm.slug,
        displayName: firm.displayName,
        checkedAt: now.toISOString(),
        verdict,
        notes,
        stages: stageVerdicts.map((s) => s.stage),
      });
    } catch (err) {
      results.push({
        pipeline: def.key,
        firm: firm.slug,
        displayName: firm.displayName,
        checkedAt: now.toISOString(),
        verdict: "red",
        notes: [`checkup query failed: ${(err as Error).message}`],
        stages: [],
      });
    }
  }
  return results;
}

const STALE_DAYS = 3;
const CRITICAL_DAYS = 30;

// Singleton pipelines (Waterfall Report) have no per-account history to
// baseline against — a shared trunk table's "normal" doesn't vary by
// weekday/weekend the way a single firm's lead flow does, so this keeps
// the simpler staleness-only check rather than anomaly.ts's logic.
function simpleStalenessVerdict(
  stage: StageResult,
  now: Date,
): { verdict: Verdict; note: string } {
  if (!stage.exists) return { verdict: "red", note: "table missing" };
  if (stage.maxDate && new Date(stage.maxDate).getTime() > now.getTime()) {
    return {
      verdict: "red",
      note: `max date ${stage.maxDate} is in the future — data correctness bug`,
    };
  }
  if (!stage.maxDate)
    return {
      verdict: "yellow",
      note: stage.note ?? "no date column — freshness unknown",
    };
  const ageDays =
    (now.getTime() - new Date(stage.maxDate).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > CRITICAL_DAYS) {
    return {
      verdict: "red",
      note: `stale by ${ageDays.toFixed(0)} days — pipeline appears stalled`,
    };
  }
  if (ageDays > STALE_DAYS) {
    return { verdict: "yellow", note: `stale by ${ageDays.toFixed(1)} days` };
  }
  return { verdict: "green", note: "fresh" };
}

async function checkupSingletonPipeline(
  def: SingletonPipelineDefinition,
): Promise<FirmCheckupResult> {
  const now = new Date();
  try {
    const stageVerdicts: {
      stage: StageResult;
      verdict: Verdict;
      note: string;
      optional?: boolean;
    }[] = [];
    for (const stageDef of def.stages) {
      const { result } = await checkStage(stageDef, undefined, {
        withDailySeries: false,
      });
      const { verdict, note } = simpleStalenessVerdict(result, now);
      stageVerdicts.push({
        stage: result,
        verdict,
        note,
        optional: stageDef.optional,
      });
    }
    const { verdict, notes } = aggregateVerdict(stageVerdicts, now);
    return {
      pipeline: def.key,
      firm: def.key,
      displayName: def.displayName,
      checkedAt: now.toISOString(),
      verdict,
      notes,
      stages: stageVerdicts.map((s) => s.stage),
    };
  } catch (err) {
    return {
      pipeline: def.key,
      firm: def.key,
      displayName: def.displayName,
      checkedAt: now.toISOString(),
      verdict: "red",
      notes: [`checkup query failed: ${(err as Error).message}`],
      stages: [],
    };
  }
}

export async function runPipelineCheckup(
  def: PipelineDefinition,
  firms?: FirmConfigWithMatch[],
): Promise<FirmCheckupResult[]> {
  if (def.shape === "singleton") {
    return [await checkupSingletonPipeline(def)];
  }
  return checkupPerFirmPipeline(def, firms ?? def.defaultActiveFirms);
}
