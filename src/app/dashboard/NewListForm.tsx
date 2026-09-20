"use client";
import { useActionState } from "react";
import { createListAction } from "../actions";

export default function NewListForm() {
  const [error, action, pending] = useActionState(createListAction, "");
  return (
    <form action={action} className="card space-y-3">
      <h2 className="text-lg font-semibold">New waitlist</h2>
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-semibold">
          Name
        </label>
        <input id="name" name="name" required maxLength={80} className="field" />
      </div>
      <div>
        <label htmlFor="origins" className="mb-1 block text-sm font-semibold">
          Allowed sites (optional)
        </label>
        <textarea
          id="origins"
          name="origins"
          rows={2}
          className="field"
          placeholder="https://mysite.ma"
          aria-describedby="origins-help"
        />
        <p id="origins-help" className="mt-1 text-sm text-muted">
          One per line. Empty means the widget works on any site. This server&apos;s own hosted page
          is always allowed.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button className="btn" disabled={pending}>
        {pending ? "Creating…" : "Create waitlist"}
      </button>
    </form>
  );
}
