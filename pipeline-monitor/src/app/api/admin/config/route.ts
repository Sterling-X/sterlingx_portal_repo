import { isAdmin } from "@/lib/auth";
import { getEffectiveFirmConfig, setFirmActive } from "@/lib/firm-config";
import { getPipeline } from "@/lib/pipelines";
import { getSession } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pipelineKey = new URL(request.url).searchParams.get("pipeline");
  const pipeline = pipelineKey ? getPipeline(pipelineKey) : undefined;
  if (!pipeline || pipeline.shape !== "per-firm") {
    return NextResponse.json(
      { error: "unknown or non-per-firm pipeline" },
      { status: 400 },
    );
  }

  const config = await getEffectiveFirmConfig(pipeline);
  return NextResponse.json(config);
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    pipeline?: string;
    slug?: string;
    displayName?: string;
    isActive?: boolean;
  } | null;

  if (
    typeof body?.pipeline !== "string" ||
    typeof body?.slug !== "string" ||
    typeof body?.displayName !== "string" ||
    typeof body?.isActive !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await setFirmActive(
    body.pipeline,
    body.slug,
    body.displayName,
    body.isActive,
    session.user.email as string,
  );
  return NextResponse.json({ ok: true });
}
