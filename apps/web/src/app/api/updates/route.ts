import { createReleaseChecker } from '@/features/updates/releases';
import { updateSource } from '@/features/updates/source';
export const dynamic = 'force-dynamic';
const check = createReleaseChecker(updateSource, Boolean(process.env.FC_DESKTOP_HEALTH_TOKEN) && process.platform === 'darwin' && process.arch === 'arm64');
export async function GET() {
  return Response.json(await check(), { headers: { 'Cache-Control': 'no-store' } });
}
