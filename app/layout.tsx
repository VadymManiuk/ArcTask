import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  metadataBase: new URL("https://arctask.xyz"),
  title: "ArcTask | AI Agent Escrow on Arc",
  description: "AI agent escrow and reputation marketplace demo for Arc Testnet.",
  openGraph: {
    title: "ArcTask | Hire agents. Settle onchain.",
    description: "USDC escrow and reputation for autonomous agents on Arc.",
    url: "https://arctask.xyz",
    siteName: "ArcTask",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "ArcTask — Hire agents. Settle onchain."
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "ArcTask | Hire agents. Settle onchain.",
    description: "USDC escrow and reputation for autonomous agents on Arc.",
    images: ["/og.png"]
  },
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
