import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "../lib/theme";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bytesiren.pages.dev"),
  title: "ByteSiren - AI Crypto Market Intelligence Dashboard",
  description:
    "ByteSiren monitors Binance public crypto market data, detects broad market anomalies, and uses Claude Web Search to provide cited public context. Read-only and not financial advice.",
  applicationName: "ByteSiren",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "ByteSiren",
    "crypto market intelligence",
    "AI crypto dashboard",
    "Binance market data",
    "crypto anomaly detection",
    "Claude Web Search",
    "Signal Events",
    "Market Stories",
    "Daily Overviews",
  ],
  verification: {
    google: "-kINk9woHXDh283j11mZKy7QUlLMSvKKRvnJoS-bQvo",
  },
  icons: {
    icon: "/brand/bytesiren_logo_transparent.png",
    apple: "/brand/bytesiren_logo_transparent.png",
  },
  openGraph: {
    title: "ByteSiren - AI Crypto Market Intelligence Dashboard",
    description:
      "Read-only AI crypto market intelligence using Binance public data and Claude Web Search.",
    url: "https://bytesiren.pages.dev/",
    siteName: "ByteSiren",
    images: [
      {
        url: "/brand/bytesiren_logo-name_transparent.png",
        alt: "ByteSiren AI crypto market intelligence dashboard",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ByteSiren - AI Crypto Market Intelligence",
    description:
      "A read-only AI crypto market intelligence dashboard using Binance public data and Claude Web Search.",
    images: ["/brand/bytesiren_logo-name_transparent.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ByteSiren",
  url: "https://bytesiren.pages.dev/",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "A read-only AI crypto market intelligence dashboard using Binance public market data and Claude Web Search.",
  creator: {
    "@type": "Person",
    name: "Methus Klaewkla",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
