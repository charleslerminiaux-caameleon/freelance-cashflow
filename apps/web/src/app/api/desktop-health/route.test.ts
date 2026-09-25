import {afterEach,it,expect,vi} from "vitest";
import {createHmac} from "node:crypto";
import {GET} from "./route";
afterEach(()=>vi.unstubAllEnvs());
it("proves possession of the launch secret without transmitting it", async()=>{
 vi.stubEnv("FC_DESKTOP_HEALTH_TOKEN","private-health-token");
 const nonce="a".repeat(64);
 const response=GET(new Request("http://localhost/api/desktop-health",{headers:{"x-fc-challenge":nonce}}));
 expect(await response.json()).toEqual({application:"freelance-cashflow",proof:createHmac("sha256","private-health-token").update(nonce).digest("hex")});
 expect(GET(new Request("http://localhost/api/desktop-health")).status).toBe(404);
});
