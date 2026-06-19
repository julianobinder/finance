export interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  isActive?: boolean;
}

export interface NavigationState {
  isSidebarOpen: boolean;
  activeMenuItem: string;
  menuItems: MenuItem[];
}

export interface NavigationContextType {
  state: NavigationState;
  toggleSidebar: () => void;
  setActiveMenuItem: (itemId: string) => void;
  setSidebarOpen: (isOpen: boolean) => void;
}
