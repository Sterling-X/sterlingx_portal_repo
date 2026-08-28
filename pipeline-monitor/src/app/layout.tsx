import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offline Conversion Pipeline Monitor",
  description: "Source-to-Google-Ads reconciliation status per firm",
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
