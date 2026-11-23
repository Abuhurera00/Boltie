import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/dm-mono/latin-400.css";

export const metadata: Metadata = {
  title: "Boltie: a little robot for your computer chores",
  description:
    "Free, open-source desktop automation for Windows and macOS. Ask Boltie to open projects, start tools and run approved commands through Claude.",
  metadataBase: new URL("https://boltie.example"),
  openGraph: {
    title: "Boltie: a little robot for your computer chores",
    description:
      "Ask Boltie to handle a computer chore. He shows every changing command before it runs.",
    type: "website",
    images: [{ url: "/share.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0e0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-type="software"
      data-radius="soft"
      data-buttons="arrow"
      data-motion="live"
      data-ground="sand"
    >
      <head>
        <meta name="page-type" content="software" />
        <meta name="site-kind" content="software" />
        <link rel="stylesheet" href="/site.css" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
