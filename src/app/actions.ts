"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { limiters } from "@/lib/ratelimit";
import {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  createSessionToken,
  hashIp,
  passwordMatches,
} from "@/lib/session";
import { createList, createListSchema, deleteEntry, deleteList } from "@/lib/waitlist";

export async function login(_prev: string, formData: FormData): Promise<string> {
  const h = await headers();
  const ip =
    process.env.TRUST_PROXY === "1"
      ? (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown")
      : "unknown";
  const rl = limiters.login.check(hashIp(ip));
  if (!rl.ok) return `Too many attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.`;
  if (!process.env.ADMIN_PASSWORD) return "Login is not configured: set ADMIN_PASSWORD.";
  const pw = formData.get("password");
  if (typeof pw !== "string" || !passwordMatches(pw, process.env.ADMIN_PASSWORD)) {
    return "Wrong password.";
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function createListAction(_prev: string, formData: FormData): Promise<string> {
  await requireAdmin();
  const parsed = createListSchema.safeParse({
    name: formData.get("name") ?? "",
    allowedOrigins: String(formData.get("origins") ?? "")
      .split(/[\s,]+/)
      .filter(Boolean),
  });
  if (!parsed.success) return parsed.error.issues.map((i) => i.message).join(" · ");
  const list = createList(getDb(), parsed.data);
  redirect(`/dashboard/${list.id}`);
}

export async function deleteListAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deleteList(getDb(), String(formData.get("id") ?? ""));
  redirect("/dashboard");
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const listId = String(formData.get("listId") ?? "");
  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) deleteEntry(getDb(), listId, id);
  redirect(`/dashboard/${encodeURIComponent(listId)}`);
}
