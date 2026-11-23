import type { Metadata } from "next";
import Script from "next/script";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./crystal.css";
export const metadata:Metadata={title:"TrustPay AI — Know who you're paying",description:"Local synthetic payment trust demo."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><Script src="/theme-init.js" strategy="beforeInteractive"/>{children}</body></html>}
