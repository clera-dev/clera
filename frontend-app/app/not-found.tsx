import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h2 className="text-2xl font-bold mb-4">Not Found</h2>
      <p className="text-gray-600 mb-4">Could not find the requested page.</p>
      <Link href="/">
        <Button variant="outline">
          Return Home
        </Button>
      </Link>
    </div>
  )
} 