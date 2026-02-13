import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "DateSky — Open Dating on Bluesky",
  description:
    "Create a dating profile on the AT Protocol network. No app, no algorithm, no company — just an open standard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-sky-950 text-white antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
