import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  CreditCard, 
  FileText, 
  Upload, 
  Tag, 
  Users, 
  DollarSign, 
  User, 
  Folder, 
  Grid3X3, 
  Building,
  Menu,
  Settings,
  BarChart2
} from 'lucide-react';
import { Sidebar as SidebarUI, SidebarHeader, SidebarContent } from '@/components/ui/sidebar';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink } from '@/components/ui/navigation-menu';
import { Button } from '@/components/ui/button';
import { useNavigation } from '@/contexts/NavigationContext';

const iconMap = {
  Home,
  CreditCard,
  FileText,
  Upload,
  Tag,
  Users,
  DollarSign,
  User,
  Folder,
  Grid3X3,
  Building,
  Settings,
  BarChart2,
};

export function Sidebar() {
  const { state, toggleSidebar } = useNavigation();
  const location = useLocation();

  if (!state.isSidebarOpen) {
    return (
      <div className="flex h-full w-16 flex-col border-r bg-card">
        <div className="flex h-16 items-center justify-center border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarUI>
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Finance App</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavigationMenu>
          {state.menuItems.map((item) => {
            const IconComponent = iconMap[item.icon as keyof typeof iconMap];
            const isActive = location.pathname === item.path;
            
            return (
              <NavigationMenuItem key={item.id}>
                <Link to={item.path}>
                  <NavigationMenuLink isActive={isActive}>
                    {IconComponent && <IconComponent className="h-4 w-4" />}
                    <span>{item.label}</span>
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            );
          })}
        </NavigationMenu>
      </SidebarContent>
    </SidebarUI>
  );
}
