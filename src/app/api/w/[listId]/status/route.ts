import { getDb } from "@/lib/db";
import { handleOptions, handleStatus } from "@/lib/api";
import { limiters } from "@/lib/ratelimit";

type Ctx = { params: Promise<{ listId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { listId } = await params;
  return handleStatus(req, listId, { db: getDb(), limiters });
}

export async function OPTIONS(req: Request, { params }: Ctx) {
  const { listId } = await params;
  return handleOptions(getDb(), listId, req);
}
