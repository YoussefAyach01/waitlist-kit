import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waitlist Kit — waitlist and referral widget",
  description: "Collect launch signups with a referral queue. One script tag, your data.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:bg-white focus:p-2"
        >
          Skip to content
        </a>
        <main id="main" className="mx-auto max-w-4xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
