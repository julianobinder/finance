import * as React from "react"
import { cn } from "@/utils/cn"

const NavigationMenu = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <nav
    ref={ref}
    className={cn("flex flex-col space-y-1", className)}
    {...props}
  >
    {children}
  </nav>
))
NavigationMenu.displayName = "NavigationMenu"

const NavigationMenuItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
NavigationMenuItem.displayName = "NavigationMenuItem"

const NavigationMenuLink = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    isActive?: boolean;
  }
>(({ className, isActive = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
      isActive && "bg-accent text-accent-foreground",
      className
    )}
    {...props}
  />
))
NavigationMenuLink.displayName = "NavigationMenuLink"

export { NavigationMenu, NavigationMenuItem, NavigationMenuLink }
