"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BlurFade } from "@/components/ui/blur-fade";

const faqs = [
  {
    question: "Why Clera vs other finance apps?",
    answer: `Most finance apps give you generic advice or just aggregate news. Clera is different — we're an SEC-registered investment advisor (CRD #338073), which means we're legally required to act in your best interest.

We provide personalized, actionable guidance based on YOUR financial situation, not one-size-fits-all recommendations. Plus, we can actually help you execute trades and manage your portfolio, not just give opinions.`,
  },
  {
    question: "Why not a human financial advisor?",
    answer: `Human advisors typically charge 1-2% of your assets annually. On a $100,000 portfolio, that's $1,000-$2,000 per year — every year.

Clera provides the same fiduciary-level guidance for just $9.99/month. Plus, we're available 24/7, never take vacations, and don't have conflicts of interest from commission-based products.

For complex situations like estate planning or business finances, we'll always recommend consulting a human specialist.`,
  },
  {
    question: "Who is Clera for?",
    answer: `Clera is perfect for:

• Busy professionals who want to invest but don't have time to research
• First-time investors who feel overwhelmed by options
• Self-directed investors who want a second opinion
• Anyone tired of paying high advisory fees

Whether you're starting with $100 or $100,000, Clera provides personalized guidance tailored to your goals.`,
  },
  {
    question: "Does Clera charge AUM fees like traditional advisors?",
    answer: `No. Never.

Traditional advisors charge 1-2% of your assets under management (AUM) annually. Clera charges one flat fee: $9.99/month. That's it.

No percentage of your assets. No hidden fees. No commissions. As your wealth grows, your cost stays the same.`,
  },
  {
    question: "How is my data protected?",
    answer: `Your security is our top priority:

• 256-bit bank-level encryption for all data
• We never sell your data to third parties
• SOC 2 compliant infrastructure
• Your credentials are never stored — we use secure OAuth connections

As an SEC-registered advisor, we're also subject to strict regulatory requirements for data protection.`,
  },
  {
    question: "Where can I reach out for support?",
    answer: `We're always here to help!

Email us anytime at support@askclera.com

We typically respond within 24 hours, often much faster. Whether you have questions, feedback, or found a bug — don't hesitate to reach out. We genuinely want to hear from you.`,
  },
];

export default function FAQSection() {
  return (
    <section className="relative w-full bg-black py-24 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Section Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Frequently asked questions
            </h2>
            <p className="text-gray-400 text-lg">
              Everything you need to know about Clera.
            </p>
          </div>
        </BlurFade>

        {/* FAQ Accordion */}
        <BlurFade delay={0.2} inView>
          <Accordion type="single" collapsible className="w-full space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border border-gray-800 rounded-2xl px-6 bg-gray-900/30 hover:bg-gray-900/50 transition-colors"
              >
                <AccordionTrigger className="text-left text-white text-lg font-medium py-5 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-gray-400 text-base leading-relaxed whitespace-pre-line">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </BlurFade>
      </div>
    </section>
  );
}
