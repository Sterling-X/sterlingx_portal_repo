import { POST as checkupPost } from "@/app/api/checkup/[pipeline]/route";

// Kept as a thin alias so the already-documented Cloud Scheduler target
// (docs/deploy-commands.md step 4, written before this app supported
// multiple pipelines) keeps working unchanged -- delegates to the
// generic /api/checkup/[pipeline] route with pipeline fixed to
// "offline_conversion". New pipelines (Waterfall Report, Pacing Report,
// anything added later) use /api/checkup/[pipeline] directly; this alias
// is not extended to them.
export async function POST(request: Request) {
  return checkupPost(request, {
    params: Promise.resolve({ pipeline: "offline_conversion" }),
  });
}
