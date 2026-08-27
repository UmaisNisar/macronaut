import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { Toaster } from "sonner";

import { CelebrationProvider } from "@/components/celebrate/celebration";
import { ThemeProvider } from "@/components/shell/theme-provider";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider>
          <CelebrationProvider>{children}</CelebrationProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
        <Toaster
          position="bottom-right"
          offset={{ bottom: 20, right: 20 }}
          mobileOffset={{ bottom: 96, left: 12, right: 12 }}
          toastOptions={{
            classNames: {
              toast:
                "!bg-[var(--card)] !border-0 !rounded-[1.5rem] !text-[var(--ink)] !font-semibold !shadow-[0_4px_0_0_var(--lip),0_12px_32px_-12px_rgb(123_97_255_/_0.4)]",
              description: "!text-[var(--ink-soft)] !font-medium",
            },
          }}
        />
      </body>
    </html>
  );
}
