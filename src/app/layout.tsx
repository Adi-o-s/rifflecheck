import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RiffleCheck",
  description:
    "A guided stream assessment that checks your answers as you go, explains every concern, and leaves every decision with you.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-5">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-600">
          RiffleCheck is a hackathon prototype for the OneAquaHealth IEEE Global Hackathon, Track 3. Your
          assessments stay in this browser.
        </footer>
      </body>
    </html>
  );
}
