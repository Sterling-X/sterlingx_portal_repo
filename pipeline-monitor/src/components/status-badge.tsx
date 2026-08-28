import type { Verdict } from "@/lib/pipelines";

const STYLES: Record<Verdict, string> = {
  green: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  yellow: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  red: "bg-red-500/20 text-red-300 border-red-500/40",
};

const LABEL: Record<Verdict, string> = {
  green: "🟢 Healthy",
  yellow: "🟡 Attention",
  red: "🔴 Broken",
};

export function StatusBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-sm font-medium ${STYLES[verdict]}`}
    >
      {LABEL[verdict]}
    </span>
  );
}
