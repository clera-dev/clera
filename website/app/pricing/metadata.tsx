import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing | Ask Clera - AI Financial Advisor',
  description: 'Explore Ask Clera\'s affordable pricing plans for AI-powered financial advice and investment management. Choose the perfect plan for your financial goals.',
  keywords: 'Ask Clera pricing, financial advisor cost, AI investing plans, affordable financial advice',
  openGraph: {
    title: 'Pricing & Plans | Ask Clera',
    description: 'Transparent, affordable pricing for AI-powered financial advice',
    url: 'https://askclera.com/pricing',
    images: [
      {
        url: '/clera-og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ask Clera - AI Financial Advisor Pricing',
      }
    ],
  },
  twitter: {
    title: 'Pricing & Plans | Ask Clera',
    description: 'Transparent, affordable pricing for AI-powered financial advice',
    images: ['/clera-og-image.png'],
  }
} 