import type { ComponentProps, HTMLAttributes } from "react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function PageBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto p-4 sm:p-6", className)}
      {...props}
    />
  )
}

export function PageContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-6xl flex-col gap-6", className)}
      {...props}
    />
  )
}

export function AppPanel({
  className,
  ...props
}: ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        "rounded-[28px] border border-slate-200/80 bg-white/85 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60 dark:shadow-black/20",
        className
      )}
      {...props}
    />
  )
}

export function SectionTag({
  className,
  ...props
}: ComponentProps<typeof Badge>) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200",
        className
      )}
      {...props}
    />
  )
}
