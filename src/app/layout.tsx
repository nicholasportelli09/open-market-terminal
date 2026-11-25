import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalystDrawer } from "@/components/research/analyst-drawer";
import { SiteFooter } from "@/components/shell/site-footer";
import { TopBar } from "@/components/shell/top-bar";
import { Tape } from "@/components/shell/tape";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Terminal",
  description: "Open-source, AI-powered market terminal: live markets, charts, research, valuation, macro and your portfolio.",
};

export const viewport: Viewport = {
  themeColor: [{ color: "#ffffff" }],
};

/** Applies saved theme / calm mode before paint. Light is the default regardless of the OS setting. */
const PREFS_SCRIPT = `try{var d=document.documentElement;d.dataset.theme=localStorage.getItem("terminal.theme")==="dark"?"dark":"light";if(localStorage.getItem("terminal.calm")==="1")d.dataset.calm="1"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TopBar />
        <Tape />
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-5 sm:px-6 lg:px-8">{children}</main>
        <SiteFooter />
        <AnalystDrawer />
      </body>
    </html>
  );
}
