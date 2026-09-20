import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — Waitlist Kit" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/dashboard");
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
      <LoginForm />
    </div>
  );
}
