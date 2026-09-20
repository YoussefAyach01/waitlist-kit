import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listLists } from "@/lib/waitlist";
import { logout } from "../actions";
import NewListForm from "./NewListForm";

export const metadata = { title: "Waitlists — Waitlist Kit" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireAdmin();
  const lists = listLists(getDb());
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Waitlists</h1>
        <form action={logout}>
          <button className="btn btn-ghost">Sign out</button>
        </form>
      </header>
      {lists.length === 0 ? (
        <p className="card text-muted">
          No waitlists yet. Create one below, then paste its script tag into your launch page.
        </p>
      ) : (
        <ul className="space-y-2">
          {lists.map((l) => (
            <li key={l.id}>
              <Link
                href={`/dashboard/${l.id}`}
                className="card flex min-h-11 flex-wrap items-center justify-between gap-2 hover:border-teal"
              >
                <span className="font-semibold">{l.name}</span>
                <span className="text-sm text-muted">
                  <span className="font-mono">{l.id}</span> · {l.count} signups
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewListForm />
    </div>
  );
}
