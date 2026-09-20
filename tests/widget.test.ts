// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb } from "@/lib/db";
import { createList, createListSchema, join } from "@/lib/waitlist";
import { handleJoin, handleStatus } from "@/lib/api";
import { RateLimiter } from "@/lib/ratelimit";

// Node 25 ships its own localStorage that shadows jsdom's; use a stub.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const source = fs.readFileSync(path.resolve(__dirname, "../public/widget.js"), "utf8");
const flush = () => new Promise((r) => setTimeout(r, 20));

type Mount = (
  host: HTMLElement,
  o: { list: string; api: string; title: string; button: string },
) => void;

let listId: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
  db = openDb(":memory:");
  listId = createList(db, createListSchema.parse({ name: "W" })).id;
  const deps = {
    db,
    limiters: { joinPerList: new RateLimiter(50, 60_000), joinPerIp: new RateLimiter(50, 60_000) },
  };
  // Route the widget's fetch calls straight into the real API handlers.
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/join")) return handleJoin(new Request(url, init), listId, deps);
    return handleStatus(new Request(url, init), listId, deps);
  });
  window.eval(source);
  document.body.innerHTML = '<div id="host"></div>';
});
afterEach(() => vi.unstubAllGlobals());

function mountWidget(): ShadowRoot {
  const host = document.getElementById("host") as HTMLElement;
  (window as unknown as { WaitlistKit: { mount: Mount } }).WaitlistKit.mount(host, {
    list: listId,
    api: "http://localhost:3220",
    title: "Join the waitlist",
    button: "Join waitlist",
  });
  return host.shadowRoot as ShadowRoot;
}

function submit(root: ShadowRoot, email: string) {
  (root.querySelector("#wk-email") as HTMLInputElement).value = email;
  root
    .querySelector("form")
    ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

describe("widget.js", () => {
  it("renders an accessible form with a label and a honeypot", () => {
    const root = mountWidget();
    expect(root.querySelector('label[for="wk-email"]')).not.toBeNull();
    expect(root.querySelector('input[name="website"]')?.getAttribute("tabindex")).toBe("-1");
    expect(root.querySelector("h2")?.textContent).toBe("Join the waitlist");
  });

  it("joins, shows rank and an invite link, and remembers the visitor", async () => {
    const root = mountWidget();
    submit(root, "sara@example.com");
    await flush();
    expect(root.querySelector(".rank")?.textContent).toBe("#1");
    const link = (root.querySelector("#wk-link") as HTMLInputElement).value;
    expect(link).toMatch(/\?ref=[a-z0-9]{8}$/);
    document.body.innerHTML = '<div id="host"></div>';
    const again = mountWidget();
    await flush();
    expect(again.querySelector(".rank")?.textContent).toBe("#1");
  });

  it("shows the server's validation error and re-enables the button", async () => {
    const root = mountWidget();
    submit(root, "not-an-email");
    await flush();
    expect(root.querySelector(".err")?.textContent).toBe("Enter a valid e-mail address");
    expect((root.querySelector("button[type=submit]") as HTMLButtonElement).disabled).toBe(false);
  });

  it("credits the referrer when the page URL carries ?ref=", async () => {
    const first = join(db, listId, "ref@x.co", null, "other-ip");
    window.history.pushState({}, "", `/?ref=${first.code}`);
    const root = mountWidget();
    submit(root, "friend@example.com");
    await flush();
    const row = db
      .prepare("SELECT referred_by FROM entries WHERE email = ?")
      .get("friend@example.com") as { referred_by: number | null };
    expect(row.referred_by).not.toBeNull();
    window.history.pushState({}, "", "/");
  });

  it("never injects server text as HTML", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ ok: false, error: "<img src=x onerror=alert(1)>" }), {
          status: 400,
        }),
    );
    const root = mountWidget();
    submit(root, "a@b.co");
    await flush();
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".err")?.textContent).toContain("<img");
  });
});
