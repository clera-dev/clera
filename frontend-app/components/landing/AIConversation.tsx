"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const conversations: { title: string; messages: Message[] }[] = [
  {
    title: "Basic Question",
    messages: [
      {
        role: "user",
        content: "Should I invest my emergency fund?",
      },
      {
        role: "assistant",
        content: `I wouldn't recommend investing your emergency fund. Here's why:

• Emergency funds should be liquid and stable
• Investing introduces volatility risk
• You might need this money at the worst market time

Instead, consider a high-yield savings account currently offering 4-5% APY. Once your emergency fund is solid (3-6 months expenses), we can talk about investing additional savings.`,
      },
    ],
  },
  {
    title: "Portfolio Analysis",
    messages: [
      {
        role: "user",
        content: "Is my portfolio too risky for my age?",
      },
      {
        role: "assistant",
        content: `Let me analyze your current allocation...

Based on your profile (age 32, moderate risk tolerance, 30+ year horizon), your current 90% stocks / 10% bonds allocation is actually appropriate.

However, I noticed you're heavily concentrated in tech stocks (45% of equity). Consider diversifying into other sectors to reduce single-sector risk.

Would you like me to suggest a rebalancing strategy?`,
      },
    ],
  },
  {
    title: "Market Event",
    messages: [
      {
        role: "user",
        content: "The market dropped 3% today. Should I sell?",
      },
      {
        role: "assistant",
        content: `I understand the concern, but let's put this in perspective:

• 3% drops happen ~12 times per year on average
• Your portfolio is designed for long-term growth
• Selling now locks in losses and often misses recovery

Historical data shows investors who panic-sell during drops underperform by 4-6% annually. Your investment thesis hasn't changed.

Stay the course. Would you like to review your risk tolerance settings?`,
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
      transition={{ duration: 0.4, delay: index * 0.3 }}
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-gray-700" : "bg-gradient-to-r from-blue-500 to-cyan-500"
        )}
      >
        {isUser ? (
          <span className="text-sm text-white">You</span>
        ) : (
          <Image
            src="/clera-logo.png"
            alt="Clera"
            width={20}
            height={20}
            className="w-5 h-5"
          />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-200 border border-gray-700"
        )}
      >
        <p className="text-sm whitespace-pre-line leading-relaxed">
          {message.content}
        </p>
      </div>
    </motion.div>
  );
}

export default function AIConversation() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section className="relative w-full bg-black py-24 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ask anything. Get real answers.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              See how Clera provides personalized, actionable guidance for your financial questions.
            </p>
          </div>
        </BlurFade>

        {/* Tab Selector */}
        <BlurFade delay={0.2} inView>
          <div className="flex justify-center gap-2 mb-8">
            {conversations.map((conv, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  activeTab === index
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                )}
              >
                {conv.title}
              </button>
            ))}
          </div>
        </BlurFade>

        {/* Chat Interface */}
        <BlurFade delay={0.3} inView>
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 min-h-[400px]">
            {/* Chat Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-gray-800 mb-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                <Image
                  src="/clera-logo.png"
                  alt="Clera"
                  width={24}
                  height={24}
                  className="w-6 h-6"
                />
              </div>
              <div>
                <p className="text-white font-medium">Clera</p>
                <p className="text-gray-500 text-xs">Your Investment Advisor</p>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-500 text-xs">Online</span>
              </div>
            </div>

            {/* Messages */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {conversations[activeTab].messages.map((message, index) => (
                  <ChatMessage key={index} message={message} index={index} />
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
