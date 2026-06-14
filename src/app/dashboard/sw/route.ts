import { SW_CODE } from "@/app/sw";

export const dynamic = "force-static";

export async function GET() {
  return new Response(SW_CODE, {
    headers: {
      "Content-Type": "application/javascript",
      "Service-Worker-Allowed": "/dashboard/",
      "Cache-Control": "public, max-age=0, must-revalidate"
    }
  });
}
