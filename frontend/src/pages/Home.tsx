import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TableColumnConfig } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';

interface Account {
  account_id: number;
  name: string;
  titular_id: number;
  titular_name: string;
  account_holder_id?: number;
  accountholder_name?: string;
  account_type_id: number;
  accounttype_name: string;
  sortcode?: string;
  number?: string;
  branch?: string;
  currency_id: number;
  currency_name: string;
  currency_symbol: string;
  is_closed: boolean;
  entry: string;
  comment?: string;
  is_hidden: boolean;
  display_name: string;
  is_active: boolean;
  full_name: string;
  groups_display: Array<{ account_group_id: number; name: string }>;
  balance: number; // Calculated balance from transactions
  order?: number;
}

interface GroupedAccounts {
  [groupName: string]: Account[];
}

interface CurrencyTotals {
  [currencySymbol: string]: number;
}

export function Home() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allCurrencies, setAllCurrencies] = useState<string[]>([]);
  const [consolidatedBalances, setConsolidatedBalances] = useState<{ [currency_id: string]: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const [accountsResponse, currenciesResponse, consolidatedResponse] = await Promise.all([
        fetch('/api/accounts/'),
        fetch('/api/accounts/lookup-data/'),
        fetch('/api/accounts/consolidated-balances/')
      ]);
      
      if (!accountsResponse.ok) {
        throw new Error('Failed to fetch accounts');
      }
      
      if (!currenciesResponse.ok) {
        throw new Error('Failed to fetch currencies');
      }

      if (!consolidatedResponse.ok) {
        throw new Error('Failed to fetch consolidated balances');
      }
      
      const accountsData = await accountsResponse.json();
      const currenciesData = await currenciesResponse.json();
      const consolidatedData = await consolidatedResponse.json();
      
      setAccounts(accountsData.results || accountsData);
      setConsolidatedBalances(consolidatedData.consolidated_balances);
      
      // Extract currency_id ISO codes from all available currencies and order them
      const currencyCodes = currenciesData.currencies.map((currency_id: any) => 
        currency_id.iso_code || currency_id.name
      );
      
      // Define the desired order
      const currencyOrder = ['GBP', 'EUR', 'USD', 'BRL'];
      const orderedCurrencies = currencyOrder.filter(currency_id => 
        currencyCodes.includes(currency_id)
      );
      
      setAllCurrencies(orderedCurrencies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Filter active and open accounts
  const activeAccounts = accounts.filter(account => account.is_active && !account.is_closed);

  // Group accounts by their primary group
  const groupedAccounts: GroupedAccounts = activeAccounts.reduce((groups, account) => {
    const groupName = account.groups_display && account.groups_display.length > 0 
      ? account.groups_display[0].name 
      : 'Ungrouped';
    
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(account);
    return groups;
  }, {} as GroupedAccounts);

  // Sort accounts within each group by order in ascending order, then by account ID
  Object.keys(groupedAccounts).forEach(groupName => {
    groupedAccounts[groupName].sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.account_id - b.account_id;
    });
  });

  // Sort groups by group order in ascending order
  const sortedGroupEntries = Object.entries(groupedAccounts).sort((a, b) => {
    const groupA = activeAccounts.find(acc => 
      acc.groups_display && acc.groups_display.length > 0 && acc.groups_display[0].name === a[0]
    );
    const groupB = activeAccounts.find(acc => 
      acc.groups_display && acc.groups_display.length > 0 && acc.groups_display[0].name === b[0]
    );
    
    const orderA = groupA?.groups_display?.[0]?.order ?? 999999;
    const orderB = groupB?.groups_display?.[0]?.order ?? 999999;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    const groupIdA = groupA?.groups_display?.[0]?.account_group_id || 999999;
    const groupIdB = groupB?.groups_display?.[0]?.account_group_id || 999999;
    
    return groupIdA - groupIdB;
  });

  // Calculate totals for each currency_id within a group
  const calculateGroupTotals = (groupAccounts: Account[]): CurrencyTotals => {
    const totals: CurrencyTotals = {};
    
    groupAccounts.forEach(account => {
      const currencyCode = account.currency_name.match(/\(([^)]+)\)$/)?.[1] || account.currency_name;
      if (!totals[currencyCode]) {
        totals[currencyCode] = 0;
      }
      // Use the calculated balance from the backend
      totals[currencyCode] += account.balance;
    });
    
    return totals;
  };

  // Function to get currency_id symbol from ISO code
  const getCurrencySymbol = (isoCode: string): string => {
    const symbolMap: { [key: string]: string } = {
      'GBP': '£',
      'EUR': '€',
      'USD': 'US$',
      'BRL': 'R$'
    };
    return symbolMap[isoCode] || isoCode;
  };

  // Handle account row click
  const handleAccountClick = (accountId: number) => {
    navigate(`/accounts/${accountId}/transactions`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Home</h1>
          <p className="text-muted-foreground">Loading accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Home</h1>
          <p className="text-destructive">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {consolidatedBalances && (
        <div className="bg-white rounded-lg border border-gray-100 p-3">
          <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Consolidated Net Worth
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(consolidatedBalances).map(([currency_id, balance]) => {
              const symbol = getCurrencySymbol(currency_id);
              const formattedBalance = Math.abs(balance).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              const isNegative = balance < 0;
              const isPositive = balance > 0;
              const balanceColor = isNegative ? '#ff4d4f' : (isPositive ? '#2e7d32' : '#9ca3af');

              return (
                <div 
                  key={currency_id} 
                  className="bg-gray-50/50 rounded-md p-2 border border-gray-100 hover:border-green-200 transition-all duration-300"
                >
                  <div className="text-[9px] font-medium text-gray-400 mb-0.5">
                    Total in {currency_id}
                  </div>
                  <div 
                    className="text-sm font-bold tracking-tight"
                    style={{ color: balanceColor }}
                  >
                    {isNegative ? '-' : ''}{symbol} {formattedBalance}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {/* Top Header Row for Currency Columns */}
        {allCurrencies.length > 0 && (
          <div className="flex w-full select-none">
            <div style={{ width: '40%', padding: '0.25rem 0.75rem' }}></div>
            <div style={{ width: '24%', padding: '0.25rem 0.75rem' }}></div>
            {allCurrencies.map(currency => (
              <div 
                key={currency} 
                className="text-right font-bold text-black"
                style={{ 
                  width: `${36 / allCurrencies.length}%`,
                  padding: '0.25rem 0.75rem',
                  fontSize: '1rem',
                  lineHeight: '1.5rem'
                }}
              >
                {currency}
              </div>
            ))}
          </div>
        )}

        {sortedGroupEntries.map(([groupName, groupAccounts]) => {
          const groupTotals = calculateGroupTotals(groupAccounts);
          
          const accountWidth = '40%';
          const accountTypeWidth = '24%';
          const remainingPercent = 36;
          const currencyWidth = allCurrencies.length > 0 ? `${remainingPercent / allCurrencies.length}%` : '0%';

          const columns: TableColumnConfig<any>[] = [
            {
              id: 'account',
              name: '',
              width: accountWidth,
              template: (account) => {
                if (account.isSummary) {
                  return '';
                }
                return (
                  <div className="font-medium text-black">
                    {account.full_name}
                  </div>
                );
              },
            },
            {
              id: 'accountType',
              name: '',
              width: accountTypeWidth,
              template: (account) => {
                if (account.isSummary) {
                  return <div className="text-right font-bold text-black">TOTAL</div>;
                }
                return (
                  <span className="text-sm text-gray-500">
                    {account.accounttype_name} ({account.currency_name})
                  </span>
                );
              },
            },
            ...allCurrencies.map(currency_id => ({
              id: currency_id,
              name: currency_id,
              align: 'right' as const,
              width: currencyWidth,
              template: (account: any) => {
                if (account.isSummary) {
                  const total = groupTotals[currency_id] || 0;
                  const isNegative = total < 0;
                  const isPositive = total > 0;
                  const colorClass = isNegative ? 'text-red-500' : (isPositive ? 'text-green-600' : 'text-gray-400');
                  return (
                    <span className={`font-bold ${colorClass}`}>
                      {getCurrencySymbol(currency_id)} {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  );
                }

                const accountCurrencyCode = account.currency_iso_code || account.currency_name;
                if (accountCurrencyCode === currency_id) {
                  const isNegative = account.balance < 0;
                  const isPositive = account.balance > 0;
                  const colorClass = isNegative ? 'text-red-500' : (isPositive ? 'text-green-600' : 'text-gray-400');
                  return (
                    <span className={`font-bold ${colorClass}`}>
                      {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  );
                }
                return '';
              },
            })),
          ];

          const tableData = [...groupAccounts, { isSummary: true, account_id: 'summary' }];
          
          return (
            <div key={groupName} className="space-y-1">
              <div className="pt-1">
                <h2 className="text-xl font-bold text-black">{groupName}</h2>
                <div className="h-[3px] bg-black w-1/2 mt-1 mb-1.5" />
              </div>
              
              <Table
                columns={columns}
                data={tableData}
                getRowDescriptor={(item: any) => ({
                  id: String(item.account_id),
                  classNames: item.isSummary ? ['dashboard-total-row'] : [],
                  interactive: !item.isSummary,
                })}
                onRowClick={(item: any) => {
                  if (!item.isSummary) {
                    handleAccountClick(item.account_id);
                  }
                }}
                className="compact-table hide-table-header"
                width="max"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
