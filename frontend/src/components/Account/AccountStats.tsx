import React from 'react';
import { CreditCard, DollarSign, TrendingUp, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Account {
  account_id: number;
  name: string;
  titular_name: string;
  accounttype_name: string;
  currency_symbol: string;
  is_closed: boolean;
  entry: string;
  display_name: string;
  is_active: boolean;
}

interface AccountStatsProps {
  accounts: Account[];
}

export function AccountStats({ accounts }: AccountStatsProps) {
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(acc => acc.is_active).length;
  const closedAccounts = accounts.filter(acc => !acc.is_active).length;
  
  // Count accounts by type
  const accountsByType = accounts.reduce((acc, account) => {
    const type = account.accounttype_name;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Count accounts by currency_id
  const accountsByCurrency = accounts.reduce((acc, account) => {
    const currency_id = account.currency_symbol;
    acc[currency_id] = (acc[currency_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const stats = [
    {
      title: 'Total Accounts',
      value: totalAccounts,
      icon: CreditCard,
      description: 'All accounts',
    },
    {
      title: 'Active Accounts',
      value: activeAccounts,
      icon: TrendingUp,
      description: 'Currently active',
    },
    {
      title: 'Closed Accounts',
      value: closedAccounts,
      icon: Eye,
      description: 'Inactive accounts',
    },
    {
      title: 'Currencies',
      value: Object.keys(accountsByCurrency).length,
      icon: DollarSign,
      description: 'Different currencies',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
