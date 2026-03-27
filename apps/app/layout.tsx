import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ReduxProvider from "@/src/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VietCalenAI",
  description: "VietCalenAI chat interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="google-site-verification" content="u3Dty_Qsps2Y82gud6NhFe-vEN6TA67v3rT3tORXUPI" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}
