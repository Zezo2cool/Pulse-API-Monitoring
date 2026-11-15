import { connection } from "next/server";
import { apiError, json, readJson } from "@/lib/api";
import { createMonitor, listMonitors } from "@/lib/monitors";
import { parseSettings } from "@/lib/monitor-validation";

export async function GET() {
  await connection();
  try { return json({ monitors: await listMonitors() }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const settings = parseSettings(await readJson(request));
    return json({ monitor: await createMonitor(settings) }, 201);
  } catch (error) { return apiError(error); }
}
