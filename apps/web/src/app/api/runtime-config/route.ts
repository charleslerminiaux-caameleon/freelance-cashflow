import { readPublicConfig } from "@/lib/env/public";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return Response.json(readPublicConfig(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "CONFIGURATION_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
