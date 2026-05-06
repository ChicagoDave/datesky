import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import MobileTabBar from "@/components/MobileTabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "DateSky — Open Dating on the Atmosphere",
  description:
    "Create a dating profile on the AT Protocol network. No app, no algorithm, no company — just an open standard. Independent project, not affiliated with Bluesky Social PBC.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="text-white antialiased pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Nav />
        {children}
        <Footer />
        <MobileTabBar />
      </body>
    </html>
  );
}
