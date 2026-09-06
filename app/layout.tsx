import type { Metadata } from "next";
import { Instrument_Serif, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_NAME, SITE_URL } from "@/app/lib/config";

// whitehouse.gov ile ayni font cifti: Instrument Serif (basliklar) + Instrument Sans (govde).
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} — The People's House, on Base`,
  description:
    "Proposals from the people, votes from the holders, funding from the treasury. No backend, no servers — every proposal and every vote lives on Base.",
  openGraph: {
    title: `${SITE_NAME} — The People's House, on Base`,
    description:
      "Write proposals, cast votes, fund the winners. Fully on-chain governance for VRNouns holders.",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — The People's House, on Base`,
    description: "Write proposals, cast votes, fund the winners. Fully on-chain.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <meta name="theme-color" content="#0D132D" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
