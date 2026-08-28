import { auth } from "@/auth";
import { getEffectiveFirmConfig, setFirmActive } from "@/lib/firm-config";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const config = await getEffectiveFirmConfig();
  return NextResponse.json(config);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    displayName?: string;
    isActive?: boolean;
  } | null;

  if (
    typeof body?.slug !== "string" ||
    typeof body?.displayName !== "string" ||
    typeof body?.isActive !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await setFirmActive(
    body.slug,
    body.displayName,
    body.isActive,
    session.user.email,
  );
  return NextResponse.json({ ok: true });
}
