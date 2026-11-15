import { connection } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    // Resolve both application tables without scanning check history.
    await getDatabase().query(`
      SELECT (SELECT count(*) FROM monitors WHERE false),
             (SELECT count(*) FROM check_results WHERE false)
    `);
    return Response.json({ status: "ok", database: "ready" }, { headers });
  } catch {
    return Response.json(
      { status: "unavailable", database: "not_ready" },
      { status: 503, headers },
    );
  }
}
