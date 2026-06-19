import * as React from "react"
import { cn } from "@/utils/cn"

const Header = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <header
    ref={ref}
    className={cn(
      "flex h-16 items-center border-b bg-background px-6",
      className
    )}
    {...props}
  />
))
Header.displayName = "Header"

const HeaderTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h1
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
))
HeaderTitle.displayName = "HeaderTitle"

const HeaderActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("ml-auto flex items-center space-x-2", className)}
    {...props}
  />
))
HeaderActions.displayName = "HeaderActions"

export { Header, HeaderTitle, HeaderActions }
