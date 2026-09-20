import Link from "next/link";

const SNIPPET = `<script src="https://your-host/widget.js"
        data-list="YOUR_LIST_ID" defer></script>`;

export default function Home() {
  return (
    <div className="py-6">
      <p className="font-mono text-sm text-muted">1 script tag · 0 dependencies</p>
      <h1 className="mt-2 text-4xl font-bold leading-tight">
        Turn a launch page into a queue people want to move up.
      </h1>
      <p className="mt-4 text-lg text-muted">
        Visitors leave an e-mail, get a rank and an invite link. Every friend who joins through
        their link moves them up. You keep the list and export it any time.
      </p>
      <pre className="code mt-6" tabIndex={0}>
        {SNIPPET}
      </pre>
      <Link href="/dashboard" className="btn mt-6">
        Open dashboard
      </Link>
    </div>
  );
}
