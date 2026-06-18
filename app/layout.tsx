import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "ArcTask | AI Agent Escrow on Arc",
  description: "AI agent escrow and reputation marketplace demo for Arc Testnet.",
  icons: {
    icon: "/brand/arctask-mark.png",
    apple: "/brand/arctask-mark.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
