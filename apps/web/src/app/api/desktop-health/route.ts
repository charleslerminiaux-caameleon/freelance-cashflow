import { createHmac } from "node:crypto";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
 const token = process.env.FC_DESKTOP_HEALTH_TOKEN;
 const challenge = request.headers.get("x-fc-challenge");
 if (!token || !challenge || !/^[a-f0-9]{64}$/.test(challenge)) return new Response(null, { status:404 });
 return Response.json({ application:"freelance-cashflow", proof:createHmac("sha256",token).update(challenge).digest("hex") }, {headers:{"Cache-Control":"no-store"}});
}
