export default function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FinancialService",
          "name": "Ask Clera",
          "alternateName": "Clera",
          "url": "https://askclera.com",
          "logo": "https://askclera.com/clera-circle.png",
          "description": "Ask Clera delivers personalized, Wall Street-level investment advice and management powered by AI.",
          "slogan": "Your personal AI financial advisor",
          "knowsAbout": ["Financial Advisory", "Investment Management", "Portfolio Optimization", "Financial Planning", "AI Investing"],
          "address": {
            "@type": "PostalAddress",
            "addressCountry": "US"
          },
          "potentialAction": {
            "@type": "UseAction",
            "target": {
              "@type": "EntryPoint",
              "urlTemplate": "https://askclera.com"
            },
            "expectsAcceptanceOf": {
              "@type": "Offer",
              "description": "AI-powered financial advice at an affordable monthly price"
            }
          },
          "sameAs": [
            // Add your social media profiles here when available
          ],
          "offers": {
            "@type": "Offer",
            "description": "AI-powered financial advice at an affordable monthly price"
          },
          "serviceType": [
            "Financial Advisory",
            "Investment Management",
            "Portfolio Optimization",
            "Financial Planning"
          ]
        })
      }}
    />
  );
} 