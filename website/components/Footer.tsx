import Link from 'next/link'
import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="bg-black border-t border-white/10">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:pt-16">
        <div className="absolute end-4 top-4 sm:end-6 sm:top-24 lg:end-8 lg:top-24">
          <a
            className="inline-flex items-center rounded-full bg-transparent border border-white/50 px-3 py-1 text-xs text-white shadow-sm transition hover:border-white hover:bg-white/10"
            href="#top"
          >
            <span className="mr-1">Back To Top</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-3"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>

        <div className="lg:flex lg:items-end lg:justify-between">
          <div>
            <div className="flex justify-center lg:justify-start -ml-4">
              <div className="transform scale-[0.6] sm:scale-[0.7] ml-3 lg:ml-5">
                <Link href="/">
                  <Logo />
                </Link>
              </div>
            </div>

            <p className="mx-auto mt-4 sm:mt-6 max-w-md text-center text-xs sm:text-sm leading-relaxed text-slate-300 lg:text-left lg:ml-3">
              Get personalized investment advice powered by AI and industry-grade analytics.
              Professional portfolio management at a fraction of traditional costs.
            </p>
            
            {/* Social Media Icons */}
            <div className="mt-4 flex justify-center lg:justify-start lg:ml-3 space-x-4">
              <a 
                href="https://www.instagram.com/askclera/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-slate-400 hover:text-[#4299e1] transition-colors duration-300"
                aria-label="Instagram"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="size-5"
                >
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>
                </svg>
              </a>
              <span 
                className="text-slate-400 cursor-default"
                aria-label="GitHub (coming soon)"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="size-5"
                >
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
                  <path d="M9 18c-4.51 2-5-2-7-2"></path>
                </svg>
              </span>
            </div>
          </div>

          <div className="mt-8 lg:mt-0">
            <div className="flex flex-col items-center lg:items-end">
              <h3 className="text-slate-200 font-medium text-xs sm:text-sm mb-2">Contact Us</h3>
              <a 
                href="mailto:support@askclera.com" 
                className="flex items-center text-slate-300 text-xs sm:text-sm transition hover:text-[#4299e1]"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="mr-2"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                </svg>
                support@askclera.com
              </a>
            </div>
          </div>
        </div>

        <p className="mt-6 sm:mt-8 text-center text-[10px] sm:text-xs text-slate-400 lg:text-right">
          Copyright &copy; {new Date().getFullYear()} Clera. All rights reserved.
        </p>
      </div>
    </footer>
  )
} 