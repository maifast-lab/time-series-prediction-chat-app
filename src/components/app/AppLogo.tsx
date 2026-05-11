import Image from "next/image"

import { cn } from "@/lib/utils"

interface AppLogoProps {
  className?: string
  labelClassName?: string
  showWordmark?: boolean
  size?: "sm" | "md" | "lg"
}

const markSizes = {
  sm: "h-10 w-10 rounded-xl",
  md: "h-14 w-14 rounded-2xl",
  lg: "h-20 w-20 rounded-[28px]",
}

export function AppLogo({
  className,
  labelClassName,
  showWordmark = false,
  size = "lg",
}: AppLogoProps) {
  return (
    <div className={cn("flex items-center gap-3 justify-center", className)}>
      <div
        className={cn(
          "relative overflow-hidden border border-slate-200/80 bg-white shadow-lg shadow-blue-950/10 dark:border-white/10 dark:bg-slate-950",
          markSizes[size]
        )}
      >
        <Image
          src="/PNG.png"
          alt="Maifast logo"
          fill
          className="object-cover h-full w-full"
          sizes="100px"
        />
      </div>

      {showWordmark ? (
        <div className={cn("min-w-0", labelClassName)}>
          <div className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
            Maifast
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            AI data workspace
          </div>
        </div>
      ) : null}
    </div>
  )
}
