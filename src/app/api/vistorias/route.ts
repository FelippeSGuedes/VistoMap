import { NextResponse } from "next/server";
import { listVistorias } from "@/lib/glpi/equipments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listVistorias();
    return NextResponse.json(items);
  } catch (error) {
    console.error("[api/vistorias] GET error", error);
    return NextResponse.json(
      { message: "Falha ao listar vistorias", error: String(error) },
      { status: 500 }
    );
  }
}
