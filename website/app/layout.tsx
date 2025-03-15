import React from "react"
import "../styles/globals.css"
import { Inter } from "next/font/google"
import { Toaster } from "sonner"
import Navigation from "../components/Navigation"
import Footer from "../components/Footer"
import JsonLd from "./schema"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

// Add viewport export for proper mobile scaling
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

// Add metadata for the site, including favicon
export const metadata = {
  metadataBase: new URL('https://askclera.com'),
  title: 'Ask Clera | Your Personal AI Financial Advisor',
  description: 'Ask Clera delivers personalized, Wall Street-level investment advice and management powered by AI. Get expert financial guidance at an affordable monthly price.',
  keywords: 'Ask Clera, askclera, Clera, AI financial advisor, investment management, financial technology, AI investing, personal finance, financial planning, wealth management, investment portfolio, automated investing',
  openGraph: {
    title: 'Ask Clera | Your Personal AI Financial Advisor',
    description: 'Get personalized, AI-powered investment advice and portfolio management at an affordable price',
    url: 'https://askclera.com',
    siteName: 'Ask Clera',
    images: [
      {
        url: '/clera-og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ask Clera - AI Financial Advisor',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ask Clera | AI-Powered Financial Advisor',
    description: 'Smart investing made simple with personalized AI financial advice',
    images: ['/clera-og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/clera-favicon.png',
    apple: '/clera-favicon.png',
  },
  alternates: {
    canonical: 'https://askclera.com',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark bg-black">
      <body className={`${inter.variable} font-sans antialiased bg-black overflow-x-hidden`}>
        <div id="top"></div>
        <Navigation />
        {children}
        <Footer />
        <Toaster />
        <JsonLd />
      </body>
    </html>
  )
}
