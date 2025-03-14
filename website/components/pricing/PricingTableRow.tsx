import { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'

interface PricingTableRowProps {
  category: {
    name: string
    features: {
      free: string[]
      plus: string[]
      pro: string[]
    }
  }
  icon?: LucideIcon
}

interface PricingTableRowMobileProps extends PricingTableRowProps {
  activePlan: string
}

export function PricingTableRowMobile({ category, icon: Icon, activePlan }: PricingTableRowMobileProps) {
  return (
    <div className="mt-4 space-y-4 transition-all duration-200 hover:bg-white/5 rounded-lg">
      <div className="flex items-center gap-2 px-4 pt-4">
        {Icon && <Icon className="w-5 h-5 text-[#4299e1]" />}
        <h3 className="text-lg font-semibold text-white">{category.name}</h3>
      </div>
      <div className="px-4 space-y-2 pb-4">
        {category.features[activePlan.toLowerCase() as keyof typeof category.features].map((feature) => (
          <div key={feature} className="flex items-start gap-2">
            <Check className="w-5 h-5 text-[#4299e1] mt-0.5" />
            <span className="text-slate-300">{feature}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PricingTableRowDesktop({ category, icon: Icon }: PricingTableRowProps) {
  return (
    <tr className="transition-all duration-200 hover:bg-white/5 group">
      <th scope="row" className="py-5 px-6">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className="w-5 h-5 text-[#4299e1] transition-transform duration-200 group-hover:scale-110" />
          )}
          <span className="text-lg font-semibold text-white">{category.name}</span>
        </div>
      </th>
      {['free', 'plus', 'pro'].map((plan) => (
        <td key={plan} className="py-5 px-6">
          <ul className="space-y-2">
            {category.features[plan as keyof typeof category.features].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="w-5 h-5 text-[#4299e1] mt-0.5 transition-transform duration-200 group-hover:scale-110" />
                <span className="text-slate-300 transition-colors duration-200 group-hover:text-white">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </td>
      ))}
    </tr>
  )
} 