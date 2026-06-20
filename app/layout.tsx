import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Suspense } from "react";
import "./globals.css";

import NotificationToaster from "@/app/components/NotificationToaster";

const defaultUrl =
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  applicationName: "HabitBase",
  title: {
    default: "HabitBase",
    template: "%s | HabitBase",
  },
  description: "継続を記録し、通知や仲間とのつながりで続けるためのアプリ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HabitBase",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={null}>
            <NotificationToaster />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
