import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { NavigationState, NavigationContextType, MenuItem } from '@/types/navigation';

// Initial menu items configuration
const initialMenuItems: MenuItem[] = [
  { id: 'home', label: 'Home', path: '/', icon: 'Home' },
  { id: 'accounts', label: 'Accounts', path: '/accounts', icon: 'CreditCard' },
  { id: 'csv-templates', label: 'CSV Templates', path: '/csv-templates', icon: 'FileText' },
  { id: 'csv-import-plan', label: 'CSV Import Plan', path: '/import-plans', icon: 'Upload' },
  { id: 'account-types', label: 'Account Types', path: '/account-types', icon: 'Tag' },
  { id: 'account-holders', label: 'Account Holders', path: '/account-holders', icon: 'Users' },
  { id: 'currencies', label: 'Currencies', path: '/currencies', icon: 'DollarSign' },
  { id: 'titulars', label: 'Titulars', path: '/titulars', icon: 'User' },
  { id: 'account-groups', label: 'Account Groups', path: '/account-groups', icon: 'Folder' },
  { id: 'categories', label: 'Categories', path: '/categories', icon: 'Grid3X3' },
  { id: 'payees', label: 'Payees', path: '/payees', icon: 'Building' },
  { id: 'reports', label: 'Reports', path: '/reports', icon: 'BarChart2' },
  { id: 'settings', label: 'Settings', path: '/settings', icon: 'Settings' },
];

const initialState: NavigationState = {
  isSidebarOpen: true,
  activeMenuItem: 'home',
  menuItems: initialMenuItems,
};

type NavigationAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_ACTIVE_MENU_ITEM'; payload: string }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean };

function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        isSidebarOpen: !state.isSidebarOpen,
      };
    case 'SET_ACTIVE_MENU_ITEM':
      return {
        ...state,
        activeMenuItem: action.payload,
      };
    case 'SET_SIDEBAR_OPEN':
      return {
        ...state,
        isSidebarOpen: action.payload,
      };
    default:
      return state;
  }
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [state, dispatch] = useReducer(navigationReducer, initialState);

  const toggleSidebar = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  };

  const setActiveMenuItem = (itemId: string) => {
    dispatch({ type: 'SET_ACTIVE_MENU_ITEM', payload: itemId });
  };

  const setSidebarOpen = (isOpen: boolean) => {
    dispatch({ type: 'SET_SIDEBAR_OPEN', payload: isOpen });
  };

  const value: NavigationContextType = {
    state,
    toggleSidebar,
    setActiveMenuItem,
    setSidebarOpen,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
