import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "vistomap",
    ts: new Date().toISOString(),
    env: {
      hasMapbox: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      hasDb: !!process.env.GLPI_DB_HOST,
      uploadPath: process.env.GLPI_UPLOAD_PATH ?? null,
      apiUrl: process.env.NEXT_PUBLIC_API_URL || "(unset → /api)",
      node: process.version,
    },
  });
}
