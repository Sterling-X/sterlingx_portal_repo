// Per-stage date-freshness verdict, replacing the old simple
// "stale by N days" aging check for every per-firm pipeline stage
// (Offline Conversion, Pacing Report). Singleton pipelines (Waterfall
// Report) don't have a "this account's own history" to compare against,
// so they keep the simpler staleness check in engine.ts instead of this.
//
// Plain-language rule (see this session's spec discussion for the full
// reasoning):
//   - A weekday with zero rows is never silently green. First occurrence
//     is yellow; if the zero-streak reaches 3+ days it's red.
//   - A weekend day (Sat/Sun) with zero rows is checked against the
//     account's own history *first*: if the surrounding Friday/Monday are
//     also zero, that's actually a weekday-shaped problem bleeding into
//     the weekend, not a normal weekend gap -- treat it via the weekday
//     escalation path. Otherwise, compare this weekend against this
//     account's own trailing-8-weekend baseline:
//       * account's weekends are normally zero -> this weekend's zero is
//         healthy (no flag).
//       * account's weekends are normally zero but this weekend has data
//         -> flag as an anomaly (first time = warning, 2+ times in the
//         lookback window = alert), since unexpected weekend activity
//         can indicate a timezone/scheduling bug.
//       * account's weekends are normally non-zero -> a zero here is a
//         real deviation, same warning/alert escalation as a weekday.
import type { Verdict } from "./types";

export interface DailyCount {
  date: string; // ISO yyyy-mm-dd
  count: number;
}

const LOOKBACK_DAYS = 70; // ~10 weeks -- enough for an 8-weekend baseline

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function dayOfWeek(iso: string): number {
  // 0 = Sunday, 6 = Saturday (UTC, matching the DATE column semantics --
  // these are already-parsed calendar dates, not timestamps needing a
  // timezone conversion).
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function mostRecentFriday(iso: string): string {
  let d = new Date(`${iso}T00:00:00Z`);
  while (d.getUTCDay() !== 5) d = addDays(d, -1);
  return toISODate(d);
}

function nextMonday(iso: string): string {
  let d = new Date(`${iso}T00:00:00Z`);
  while (d.getUTCDay() !== 1) d = addDays(d, 1);
  return toISODate(d);
}

function countConsecutiveZeroDaysBackward(
  counts: Map<string, number>,
  fromDateISO: string,
): number {
  let streak = 0;
  let d = new Date(`${fromDateISO}T00:00:00Z`);
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const iso = toISODate(d);
    const c = counts.get(iso) ?? 0;
    if (c > 0) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

type Baseline = "typically-zero" | "typically-nonzero" | "insufficient-data";

// Looks at up to the 8 most recent weekend days (Sat/Sun) strictly before
// evalDate, within the fetched window, and classifies whether this
// account's weekends are normally zero or normally non-zero.
function classifyWeekendBaseline(
  counts: Map<string, number>,
  evalDateISO: string,
): { baseline: Baseline; sampleSize: number } {
  const evalDate = new Date(`${evalDateISO}T00:00:00Z`);
  const samples: number[] = [];
  let d = addDays(evalDate, -1);
  const earliest = addDays(evalDate, -LOOKBACK_DAYS);
  while (d.getTime() >= earliest.getTime() && samples.length < 16) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) {
      const iso = toISODate(d);
      if (counts.has(iso)) samples.push(counts.get(iso) ?? 0);
    }
    d = addDays(d, -1);
  }
  if (samples.length < 4) {
    return { baseline: "insufficient-data", sampleSize: samples.length };
  }
  const zeroCount = samples.filter((c) => c === 0).length;
  const baseline: Baseline =
    zeroCount >= samples.length * 0.7 ? "typically-zero" : "typically-nonzero";
  return { baseline, sampleSize: samples.length };
}

// Within the lookback window, how many weekend days deviated from a
// "typically-zero" baseline by having nonzero data (used for the
// "twice, consecutive or not" escalation rule).
function countUnexpectedWeekendNonzero(
  counts: Map<string, number>,
  evalDateISO: string,
): number {
  const evalDate = new Date(`${evalDateISO}T00:00:00Z`);
  const earliest = addDays(evalDate, -LOOKBACK_DAYS);
  let occurrences = 0;
  let d = new Date(evalDate.getTime()); // include evalDate itself
  while (d.getTime() >= earliest.getTime()) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) {
      const iso = toISODate(d);
      if ((counts.get(iso) ?? 0) > 0) occurrences++;
    }
    d = addDays(d, -1);
  }
  return occurrences;
}

export function deriveDateFreshnessVerdict(
  dailyCounts: DailyCount[],
  now: Date,
): { verdict: Verdict; note: string } {
  const counts = new Map(dailyCounts.map((d) => [d.date, d.count]));

  // Evaluate the most recent *complete* day -- "today" may still be
  // partially ingested, so checking it would produce false positives
  // every single run until the day finishes.
  const evalDateISO = toISODate(addDays(now, -1));
  const count = counts.get(evalDateISO) ?? 0;
  const dow = dayOfWeek(evalDateISO);
  const isWeekend = dow === 0 || dow === 6;

  if (!isWeekend) {
    if (count > 0) return { verdict: "green", note: "fresh" };
    const streak = countConsecutiveZeroDaysBackward(counts, evalDateISO);
    return streak >= 3
      ? {
          verdict: "red",
          note: `weekday zero, ${streak}-day streak — pipeline appears stalled`,
        }
      : { verdict: "yellow", note: `weekday zero on ${evalDateISO}` };
  }

  // Weekend day: check the account's own bracketing Friday/Monday before
  // trusting a weekend-specific baseline comparison.
  const fridayISO = mostRecentFriday(evalDateISO);
  const mondayISO = nextMonday(evalDateISO);
  const fridayCount = counts.get(fridayISO);
  const mondayKnown =
    new Date(`${mondayISO}T00:00:00Z`).getTime() <= now.getTime();
  const mondayCount = counts.get(mondayISO);
  const fridayOk = fridayCount !== undefined && fridayCount > 0;
  const mondayOk = !mondayKnown
    ? null
    : mondayCount !== undefined && mondayCount > 0;

  if (!fridayOk || mondayOk === false) {
    const streak = countConsecutiveZeroDaysBackward(counts, evalDateISO);
    if (count === 0) {
      return streak >= 3
        ? {
            verdict: "red",
            note: `weekend zero with adjacent weekday(s) also zero, ${streak}-day streak — treated as a weekday-shaped issue`,
          }
        : {
            verdict: "yellow",
            note: "weekend zero, and the adjacent Friday/Monday is also zero — flagged as a weekday-shaped issue, not a normal weekend gap",
          };
    }
    return {
      verdict: "yellow",
      note: "this weekend day has data, but the adjacent Friday/Monday is zero — worth checking",
    };
  }

  const { baseline, sampleSize } = classifyWeekendBaseline(counts, evalDateISO);

  if (baseline === "insufficient-data") {
    return count > 0
      ? {
          verdict: "green",
          note: "weekend has data; insufficient history to judge normalcy",
        }
      : {
          verdict: "yellow",
          note: `weekend zero; only ${sampleSize} prior weekend days of history — can't yet confirm this is normal`,
        };
  }

  if (baseline === "typically-zero") {
    if (count === 0) {
      return {
        verdict: "green",
        note: "weekend zero — normal for this account",
      };
    }
    const occurrences = countUnexpectedWeekendNonzero(counts, evalDateISO);
    return occurrences >= 2
      ? {
          verdict: "red",
          note: `unexpected weekend data for an account that's normally weekend-zero — ${occurrences} occurrences in the last ${LOOKBACK_DAYS} days`,
        }
      : {
          verdict: "yellow",
          note: "unexpected weekend data for an account that's normally weekend-zero — first occurrence",
        };
  }

  // baseline === "typically-nonzero"
  if (count > 0) return { verdict: "green", note: "fresh" };
  const streak = countConsecutiveZeroDaysBackward(counts, evalDateISO);
  return streak >= 3
    ? {
        verdict: "red",
        note: `weekend zero deviates from this account's normal weekend pattern, ${streak}-day streak`,
      }
    : {
        verdict: "yellow",
        note: "weekend zero deviates from this account's normal weekend pattern",
      };
}

export { LOOKBACK_DAYS };
