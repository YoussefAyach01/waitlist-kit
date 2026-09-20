import Link from "next/link";
import { notFound } from "next/navigation";
import { baseUrl, requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getList, listEntries } from "@/lib/waitlist";
import { deleteEntryAction, deleteListAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ListPage({ params }: { params: Promise<{ listId: string }> }) {
  await requireAdmin();
  const { listId } = await params;
  const db = getDb();
  const list = getList(db, listId);
  if (!list) notFound();
  const entries = listEntries(db, list.id);
  const host = await baseUrl();
  const top = [...entries]
    .filter((e) => e.referrals > 0)
    .sort((a, b) => b.referrals - a.referrals)
    .slice(0, 5);
  const snippet = `<script src="${host}/widget.js"\n        data-list="${list.id}" defer></script>`;

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-teal underline">
        ← All waitlists
      </Link>
      <h1 className="text-2xl font-bold">{list.name}</h1>

      <section aria-labelledby="embed" className="space-y-2">
        <h2 id="embed" className="font-semibold">
          Embed it
        </h2>
        <pre className="code" tabIndex={0}>
          {snippet}
        </pre>
        <p className="text-sm text-muted">
          Or share the hosted page:{" "}
          <a className="text-teal underline" href={`/w/${list.id}`}>
            {host}/w/{list.id}
          </a>
          . Allowed sites: {list.allowedOrigins.length ? list.allowedOrigins.join(", ") : "any"}.
        </p>
      </section>

      {top.length > 0 && (
        <section aria-labelledby="top" className="space-y-2">
          <h2 id="top" className="font-semibold">
            Top referrers
          </h2>
          <ol className="card list-decimal space-y-1 pl-8">
            {top.map((e) => (
              <li key={e.id}>
                {e.email} <span className="text-muted">({e.referrals})</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="entries" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="entries" className="font-semibold">
            Signups ({entries.length})
          </h2>
          <a href={`/dashboard/${list.id}/export`} className="btn btn-ghost">
            Download CSV
          </a>
        </div>
        {entries.length === 0 ? (
          <p className="card text-muted">
            No signups yet. Open the hosted page and join once to test.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.id} className="card flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all font-semibold">{e.email}</p>
                  <p className="font-mono text-xs text-muted">
                    {e.createdAt.replace("T", " ").slice(0, 16)} UTC · {e.referrals} referrals
                    {e.referredBy ? ` · via ${e.referredBy}` : ""}
                  </p>
                </div>
                <form action={deleteEntryAction}>
                  <input type="hidden" name="listId" value={list.id} />
                  <input type="hidden" name="id" value={e.id} />
                  <button className="btn btn-danger" aria-label={`Delete ${e.email}`}>
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={deleteListAction} className="border-t border-line pt-4">
        <input type="hidden" name="id" value={list.id} />
        <button className="btn btn-danger">Delete this waitlist and all its signups</button>
      </form>
    </div>
  );
}
