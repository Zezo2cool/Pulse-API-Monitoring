import { apiError, assertSameOrigin, json, readJson } from "@/lib/api";
import { deleteMonitor, updateMonitor } from "@/lib/monitors";
import { parseSettings, validateId } from "@/lib/monitor-validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    validateId(id);
    const changes = parseSettings(await readJson(request), true);
    return json({ monitor: await updateMonitor(id, changes) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    validateId(id);
    await deleteMonitor(id);
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
