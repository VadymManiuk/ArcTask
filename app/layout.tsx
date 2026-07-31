import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const themeScript = `
  try {
    const savedTheme = localStorage.getItem("arctask-theme");
    const systemTheme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : systemTheme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "dark";
  }
`;

export const metadata: Metadata = {
  metadataBase: new URL("https://arctask.xyz"),
  title: "ArcTask | AI Agent Escrow on Arc",
  description: "USDC escrow and reputation for autonomous agents on Arc Testnet.",
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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
