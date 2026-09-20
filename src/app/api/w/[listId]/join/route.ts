import { getDb } from "@/lib/db";
import { handleJoin, handleOptions } from "@/lib/api";
import { limiters } from "@/lib/ratelimit";

type Ctx = { params: Promise<{ listId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { listId } = await params;
  return handleJoin(req, listId, { db: getDb(), limiters });
}

export async function OPTIONS(req: Request, { params }: Ctx) {
  const { listId } = await params;
  return handleOptions(getDb(), listId, req);
}
