"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BlurFade } from "@/components/ui/blur-fade";
import { AlertCircle, Calculator, DollarSign, Scale } from "lucide-react";

const disclaimers = [
  {
    id: "simulator",
    icon: <Calculator className="h-5 w-5 text-blue-400" />,
    title: "Simulator Disclaimer",
    content: `The growth projections and portfolio simulations shown on this page are hypothetical illustrations for educational purposes only. They are not predictions of future performance and should not be construed as investment advice.

Past performance does not guarantee future results. Actual investment returns will vary based on market conditions, individual circumstances, and investment decisions. The scenarios presented are simplified models and do not account for all factors that may affect investment performance.

All investment involves risk, including the potential loss of principal. Before making any investment decisions, please consult with a qualified financial advisor.`,
  },
  {
    id: "assumptions",
    icon: <AlertCircle className="h-5 w-5 text-amber-400" />,
    title: "Return Rate Assumptions",
    content: `The return rates used in our simulations are based on historical market data and reasonable projections:

• Conservative (6%): Based on a portfolio weighted toward bonds and stable value investments
• Balanced (8%): Based on a diversified portfolio of stocks and bonds, approximating long-term market averages
• Aggressive (10%): Based on a growth-oriented portfolio weighted toward equities

• Average Investor Return (4.05%): Based on DALBAR's Quantitative Analysis of Investor Behavior (QAIB) 2023 report, representing the average equity fund investor return over a 3-year period

All returns are presented as annual rates and assume monthly compounding. Returns do not account for taxes, which may significantly impact your actual returns. Real-world performance will differ based on market conditions, timing of investments, and individual circumstances.`,
  },
  {
    id: "fees",
    icon: <DollarSign className="h-5 w-5 text-emerald-400" />,
    title: "Fee Structure",
    content: `Clera charges a simple, transparent flat fee:

• Monthly subscription: $9.99/month
• No assets under management (AUM) fees
• No performance fees
• No hidden costs

Third-party costs you may incur separately:
• Brokerage transaction fees (if applicable to your broker)
• Fund expense ratios for ETFs and mutual funds you invest in
• Standard market spreads

Our fee structure is designed to align our interests with yours. Unlike traditional advisors who charge 1-2% of AUM annually, our flat fee means we don't earn more when you invest more—we succeed when you succeed.`,
  },
  {
    id: "legal",
    icon: <Scale className="h-5 w-5 text-purple-400" />,
    title: "Legal & Regulatory",
    content: `Clera is a SEC-registered investment advisor (CRD #338073). Registration with the SEC does not imply a certain level of skill or training.

As a fiduciary, Clera is legally obligated to act in your best interest. We do not receive compensation from third parties for recommending specific investments.

Important disclosures:
• Investment advice is provided based on information you provide and is subject to limitations
• Clera does not provide tax, legal, or accounting advice
• You are responsible for your own investment decisions
• Past performance is not indicative of future results

For our full advisory agreement, Form ADV, and privacy policy, please visit our legal documents page or contact support@askclera.com.`,
  },
];

export default function DisclaimerSection() {
  return (
    <section className="relative w-full py-16 px-6 bg-black">
      <div className="max-w-3xl mx-auto">
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-8">
            <h3 className="text-xl font-semibold mb-2 text-gray-300">
              Important Disclosures
            </h3>
            <p className="text-sm text-gray-500">
              Please review the following information carefully.
            </p>
          </div>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <Accordion type="single" collapsible className="w-full">
            {disclaimers.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-b last:border-b-0 border-gray-800"
              >
                <AccordionTrigger className="hover:no-underline py-4 text-gray-200 hover:text-white">
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed whitespace-pre-line text-gray-400">
                  {item.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </BlurFade>
      </div>
    </section>
  );
}
