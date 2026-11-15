import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StbLab remote",
  description: "Laptop remote for the Airtel Xstream box",
};

// No next/font/google here on purpose: it fetches the font at build time, so the build breaks
// without network access. The CSS already falls back to the system stack.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
