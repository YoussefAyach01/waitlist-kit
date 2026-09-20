import Script from "next/script";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getList } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

// Hosted signup page: share this URL directly if you have no site of your own.
export default async function HostedPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  const list = getList(getDb(), listId);
  if (!list) notFound();
  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-4 text-3xl font-bold">{list.name}</h1>
      <div id="wk-host" />
      <Script
        src="/widget.js"
        strategy="afterInteractive"
        data-list={list.id}
        data-target="#wk-host"
        data-title="Get early access"
      />
    </div>
  );
}
