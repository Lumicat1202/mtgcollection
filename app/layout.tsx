import type { Metadata } from "next";
import { Cinzel, Alegreya_Sans } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import ArtBackground from "@/components/ArtBackground";

const heading = Cinzel({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Alegreya_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "MTG Collection",
  description: "My Magic: The Gathering bulk card inventory",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${heading.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ArtBackground />
        <NavBar />
        {children}
        <footer className="mt-auto px-4 py-4 text-center text-xs text-gray-500">
          MTG Collection is unofficial Fan Content permitted under the Fan Content Policy. Not
          approved/endorsed by Wizards. Portions of the materials used are property of Wizards of
          the Coast. ©Wizards of the Coast LLC. Card data and images from Scryfall.
        </footer>
      </body>
    </html>
  );
}