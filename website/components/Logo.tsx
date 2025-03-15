import Image from 'next/image'
import { cn } from '@/lib/utils'

export default function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/clera-logo.png"
        alt="Clera Logo"
        width={100}
        height={30}
        className="h-8 w-auto"
        priority
      />
    </div>
  )
} 