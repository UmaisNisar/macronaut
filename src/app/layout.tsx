import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { headers } from "next/headers";

import { CelebrationProvider } from "@/components/celebrate/celebration";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { AppToaster } from "@/components/shell/app-toaster";
import { ServiceWorkerRegistrar } from "@/components/shell/service-worker";

import "./globals.css";

const body = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const display = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Macronaut — your cute little food buddy",
    template: "%s · Macronaut",
  },
  description:
    "Tell Momo what you ate and it works out the rest. A sweet little AI companion for food, weight, and actually seeing yourself improve.",
  applicationName: "Macronaut",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Macronaut",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  other: {
    // Next emits the modern `mobile-web-app-capable`; iOS before 16.4 only
    // understands the Apple-prefixed one, so ship both.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5FF" },
    { media: "(prefers-color-scheme: dark)", color: "#141221" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
  initialScale: 1,
  // Pinch-zoom stays enabled; iOS focus-zoom is handled with 16px inputs.
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by the proxy, one per request. Everything Next renders itself is
  // stamped automatically; this is for the one script it does not own.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider nonce={nonce}>
          <CelebrationProvider>{children}</CelebrationProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
        {/*
          Vercel's own analytics: cookieless, no cross-site identifiers, and no
          per-person profiles — which is the only kind worth putting on an app
          that knows what someone eats and what they weigh. Speed Insights
          reports real-device timings, which is how the navigation work earlier
          gets checked against actual phones rather than a throttled desktop.
        */}
        <Analytics />
        <SpeedInsights />
        <AppToaster />
      </body>
    </html>
  );
}
