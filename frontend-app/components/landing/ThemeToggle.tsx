"use client";

import { motion } from "motion/react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="w-full flex justify-center py-8">
      <motion.button
        onClick={toggleTheme}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`
          relative flex items-center gap-3 px-6 py-3 rounded-full
          backdrop-blur-md border transition-all duration-300
          ${theme === "dark"
            ? "bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700/50"
            : "bg-white/60 border-gray-200/50 text-gray-700 hover:bg-white/80 shadow-lg shadow-blue-500/5"
          }
        `}
      >
        <motion.div
          initial={false}
          animate={{ rotate: theme === "dark" ? 0 : 180 }}
          transition={{ duration: 0.3 }}
        >
          {theme === "dark" ? (
            <Moon className="w-5 h-5 text-blue-400" />
          ) : (
            <Sun className="w-5 h-5 text-amber-500" />
          )}
        </motion.div>
        <span className="text-sm font-medium">
          {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        </span>
      </motion.button>
    </div>
  );
}
