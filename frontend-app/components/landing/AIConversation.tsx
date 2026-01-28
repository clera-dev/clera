"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "motion/react";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Message {
  role: "user" | "assistant";
  content: string;
  highlight?: { value: string; label: string }[];
}

const conversations: { title: string; icon: string; messages: Message[] }[] = [
  {
    title: "Market Volatility",
    icon: "📉",
    messages: [
      {
        role: "user",
        content: "My portfolio is down 3% today. What's happening?",
      },
      {
        role: "assistant",
        content: `Today's decline is part of a broader market correction driven by rising Treasury yields and tech sector rotation.

Here's what's affecting your portfolio:

• Technology (-4.2%): Rate sensitivity hitting growth stocks
• Healthcare (+0.8%): Defensive rotation providing some offset
• Your exposure: 62% in affected sectors

Historical context: Similar 3% drops occur ~12 times per year. Since 1950, the market has recovered from every correction within 18 months on average.

Your portfolio is designed for this. No action needed—but I can run a stress test if you'd like more clarity.`,
        highlight: [
          { value: "-3.0%", label: "Today" },
          { value: "+847%", label: "Since 1980" },
        ],
      },
    ],
  },
  {
    title: "Stress Testing",
    icon: "🔬",
    messages: [
      {
        role: "user",
        content: "What would happen to my portfolio in another 2008-style crash?",
      },
      {
        role: "assistant",
        content: `I've run a simulation using 2008-2009 market conditions against your current portfolio.

Projected impact on your $247,500 portfolio:

• Maximum drawdown: -38.2% (-$94,545)
• Portfolio low point: $152,955
• Recovery timeline: ~4.1 years to break even

However, your current allocation is more diversified than average 2008 portfolios. Your bond allocation would cushion ~12% of the fall.

Key insight: Investors who stayed invested through 2008-2009 saw 400%+ returns over the following decade.

Would you like me to suggest hedging strategies that could reduce your max drawdown to -25%?`,
        highlight: [
          { value: "-38.2%", label: "Max Drawdown" },
          { value: "4.1 yrs", label: "Recovery" },
        ],
      },
    ],
  },
  {
    title: "401k Planning",
    icon: "🎯",
    messages: [
      {
        role: "user",
        content: "I am concerned about my 401k health. What's the play?",
      },
      {
        role: "assistant",
        content: `Based on your profile, you have stated you are 45 with a goal of $1.8M in your 401(k) and retiring early.

Early retirement with traditional accounts = Roth conversion ladder opportunity.

From 45-59: Convert ~$94K/year (stay in 22% bracket)
By 60: ~$1.4M+ moved to Roth, tax-free forever
Net tax savings: ~$380K vs. Required Minimum Distribution-forced distributions at 73

I'd pair this with Substantially Equal Periodic Payments (72t) for bridge income. Your healthcare costs qualify for Affordable Care Act subsidies if we keep Modified Adjusted Gross Income under $64K.

Want me to build the year-by-year conversion schedule or explain any of the programs mentioned?`,
        highlight: [
          { value: "$380K", label: "Tax Savings" },
          { value: "45→60", label: "Conversion Window" },
        ],
      },
    ],
  },
];

function ChatMessage({ message, index }: { message: Message; index: number }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.4 }}
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden",
          isUser
            ? "bg-gradient-to-br from-gray-600 to-gray-800"
            : "bg-gradient-to-br from-blue-500 to-cyan-500 p-[2px]"
        )}
      >
        {isUser ? (
          <span className="text-xs font-medium text-white">You</span>
        ) : (
          <Image
            src="/clera-circle.png"
            alt="Clera"
            width={36}
            height={36}
            className="w-full h-full object-cover rounded-full"
          />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-800/80 text-gray-200 border border-gray-700/50 backdrop-blur-sm"
        )}
      >
        <p className="text-sm whitespace-pre-line leading-relaxed">
          {message.content}
        </p>

        {/* Highlight metrics for assistant messages */}
        {!isUser && message.highlight && (
          <div className="flex gap-3 mt-4 pt-3 border-t border-gray-700/50">
            {message.highlight.map((item, i) => (
              <div key={i} className="text-center">
                <p className={cn(
                  "text-lg font-bold",
                  item.value.startsWith("-") ? "text-red-500" : "text-emerald-500"
                )}>
                  {item.value}
                </p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function AIConversation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeConversation, setActiveConversation] = useState(0);
  const [hasScrolledThrough, setHasScrolledThrough] = useState(false);

  // Track scroll progress within this section
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start center", "end center"],
  });

  // Update active conversation based on scroll position
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const segments = conversations.length;
    const index = Math.min(
      Math.floor(latest * segments),
      segments - 1
    );

    if (index !== activeConversation && index >= 0) {
      setActiveConversation(index);
    }

    // Check if user has scrolled through most of the section
    if (latest > 0.9) {
      setHasScrolledThrough(true);
    }
  });

  return (
    <section
      id="chat"
      ref={sectionRef}
      className="relative w-full py-24 px-6 min-h-[100vh] bg-black"
    >
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Radial gradient */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl bg-gradient-radial from-blue-500/10 via-transparent to-transparent" />

        {/* Glow orbs */}
        <motion.div
          animate={{
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 right-[20%] w-64 h-64 rounded-full blur-3xl bg-cyan-500/20"
        />
        <motion.div
          animate={{
            x: [0, -40, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 left-[15%] w-72 h-72 rounded-full blur-3xl bg-blue-600/15"
        />
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Section Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
              Ask anything. Get real answers.
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-gray-400">
              See how Clera provides personalized, actionable guidance, from daily market moves to long-term strategy.
            </p>
          </div>
        </BlurFade>

        {/* Conversation indicator pills */}
        <BlurFade delay={0.2} inView>
          <div className="flex justify-center gap-2 mb-8">
            {conversations.map((conv, index) => (
              <button
                key={index}
                onClick={() => setActiveConversation(index)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                  activeConversation === index
                    ? "bg-blue-600 text-white scale-105"
                    : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-300"
                )}
              >
                <span>{conv.icon}</span>
                <span className="hidden sm:inline">{conv.title}</span>
              </button>
            ))}
          </div>
        </BlurFade>

        {/* Scroll hint - hidden after first pass */}
        {!hasScrolledThrough && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center mb-4"
          >
            <p className="text-sm flex items-center justify-center gap-2 text-gray-500">
              <motion.span
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                ↓
              </motion.span>
              Scroll to explore conversations
            </p>
          </motion.div>
        )}

        {/* Chat Interface */}
        <BlurFade delay={0.3} inView>
          <div className="rounded-3xl p-6 min-h-[450px] backdrop-blur-xl shadow-2xl bg-gray-900/60 border border-gray-800/80 shadow-blue-500/5">
            {/* Chat Header */}
            <div className="flex items-center gap-3 pb-4 border-b mb-6 border-gray-800/50">
              <div className="w-11 h-11 rounded-full overflow-hidden">
                <Image
                  src="/clera-circle.png"
                  alt="Clera"
                  width={44}
                  height={44}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-medium text-white">Clera</p>
                <p className="text-xs text-gray-500">Your Investment Advisor</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-500 text-xs font-medium">Online</span>
              </div>
            </div>

            {/* Messages */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeConversation}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-5"
              >
                {conversations[activeConversation].messages.map((message, index) => (
                  <ChatMessage key={index} message={message} index={index} />
                ))}
              </motion.div>
            </AnimatePresence>

            {/* Typing indicator area */}
            <div className="mt-6 pt-4 border-t border-gray-800/50">
              <div className="flex items-center gap-2 text-sm">
                <div className="flex-1 rounded-full px-4 py-2.5 bg-gray-800/50 text-gray-500">
                  Ask Clera anything...
                </div>
                <button className="p-2.5 rounded-full bg-blue-600 hover:bg-blue-500 transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
