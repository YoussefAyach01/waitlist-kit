import { isAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db";
import { getList, listEntries } from "@/lib/waitlist";

export async function GET(_req: Request, { params }: { params: Promise<{ listId: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { listId } = await params;
  const db = getDb();
  if (!getList(db, listId)) return new Response("Not found", { status: 404 });
  const rows = listEntries(db, listId, 100_000).map((e) => ({
    createdAt: e.createdAt,
    data: { email: e.email, referrals: String(e.referrals), referred_by: e.referredBy ?? "" },
  }));
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waitlist-${listId.replace(/[^\w-]/g, "")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
