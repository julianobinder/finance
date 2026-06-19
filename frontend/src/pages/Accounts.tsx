import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountModal } from '@/components/Account/AccountModal';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';
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
  currency_string?: string;
  is_closed: boolean;
  entry: string;
  comment?: string;
  is_hidden: boolean;
  display_name: string;
  is_active: boolean;
  full_name: string;
  groups_display: Array<{ account_group_id: number; name: string; order: number }>;
  order?: number;
}

interface LookupData {
  titulars: Array<{ titular_id: number; name: string }>;
  account_holders: Array<{ account_holder_id: number; name: string; comments?: string }>;
  account_types: Array<{ account_type_id: number; name: string; code: number }>;
  currencies: Array<{ currency_id: number; name: string; iso_code: string; symbol: string; order: number }>;
  account_groups: Array<{ account_group_id: number; name: string; is_hidden: boolean; order: number }>;
}

export function Accounts() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lookupData, setLookupData] = useState<LookupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('active');

  const API_BASE_URL = '/api/accounts';

  useEffect(() => {
    // Add a small delay to ensure the server is ready
    const timer = setTimeout(() => {
      fetchAccounts();
      fetchLookupData();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [filter]);

  const fetchAccounts = async (retryCount = 0) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter === 'active') params.append('is_active', 'true');
      if (filter === 'closed') params.append('is_active', 'false');
      
      const response = await fetch(`${API_BASE_URL}/?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText}`);
      
      const data = await response.json();
      setAccounts(data.results || data);
      setError(null);
    } catch (err) {
      console.error('Error fetching accounts:', err);
      if (retryCount < 3) {
        setTimeout(() => fetchAccounts(retryCount + 1), 1000 * (retryCount + 1));
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchLookupData = async (retryCount = 0) => {
    try {
      const response = await fetch(`${API_BASE_URL}/lookup-data/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error(`Failed to fetch lookup data: ${response.status} ${response.statusText}`);
      
      const data = await response.json();
      setLookupData(data);
    } catch (err) {
      console.error('Failed to fetch lookup data:', err);
      if (retryCount < 3) {
        setTimeout(() => fetchLookupData(retryCount + 1), 1000 * (retryCount + 1));
      }
    }
  };

  const handleCreateAccount = () => {
    setEditingAccount(null);
    setIsModalOpen(true);
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccount(account);
    setIsModalOpen(true);
  };

  const handleDeleteAccount = async (accountId: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Account',
      'Are you sure you want to delete this account?'
    );
    if (!confirmed) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/${accountId}/`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete account');
      
      showSuccess('Account deleted successfully');
      setAccounts(accounts.filter(acc => acc.account_id !== accountId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete account';
      setError(errorMessage);
      showError('Failed to delete account', errorMessage);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
  };

  const handleAccountSaved = (savedAccount: Account) => {
    if (editingAccount) {
      setAccounts(accounts.map(acc => 
        acc.account_id === savedAccount.account_id ? savedAccount : acc
      ));
    } else {
      setAccounts([savedAccount, ...accounts]);
    }
    handleModalClose();
  };

  const filteredAccounts = accounts.filter(account => {
    if (filter === 'active') return account.is_active;
    if (filter === 'closed') return !account.is_active;
    return true;
  });

  // Group accounts by their groups
  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const groupName = account.groups_display && account.groups_display.length > 0 ? account.groups_display[0].name : 'Ungrouped';
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(account);
    return groups;
  }, {} as Record<string, Account[]>);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">
            Manage your financial accounts and their details.
          </p>
        </div>
        <Button onClick={handleCreateAccount} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Account
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center space-x-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Accounts
          </Button>
          <Button
            variant={filter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('active')}
          >
            Active
          </Button>
          <Button
            variant={filter === 'closed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('closed')}
          >
            Closed
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading accounts...</div>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No accounts found</h3>
          <p className="text-muted-foreground mb-4">
            {filter === 'all' 
              ? "You haven't created any accounts yet."
              : `No ${filter} accounts found.`
            }
          </p>
          {filter === 'all' && (
            <Button onClick={handleCreateAccount}>
              <Plus className="h-4 w-4 mr-2" />
              Create your first account
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedAccounts).sort((a, b) => {
            const groupA = filteredAccounts.find(acc => 
              acc.groups_display && acc.groups_display.length > 0 && acc.groups_display[0].name === a[0]
            );
            const groupB = filteredAccounts.find(acc => 
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
          }).map(([groupName, groupAccounts]) => {
            const columns: TableColumnConfig<Account>[] = [
              {
                id: 'name',
                name: 'Account Name',
                template: (account) => (
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{account.full_name}</span>
                  </div>
                ),
              },
              {
                id: 'currency_id',
                name: 'Currency',
                template: (account) => (
                  <span className="text-sm font-medium">{account.currency_string || account.currency_symbol}</span>
                ),
              },
              {
                id: 'type',
                name: 'Type',
                template: (account) => <span className="text-sm">{account.accounttype_name}</span>,
              },
              {
                id: 'group',
                name: 'Group',
                template: (account) => (
                  <span className="text-sm text-muted-foreground">
                    {account.groups_display && account.groups_display.length > 0 ? account.groups_display[0].name : 'Ungrouped'}
                  </span>
                ),
              },
              {
                id: 'created',
                name: 'Created',
                template: (account) => (
                  <span className="text-sm text-muted-foreground">
                    {(() => {
                      const date = new Date(account.entry);
                      if (isNaN(date.getTime())) return account.entry;
                      return date.toLocaleDateString('en-US', {
                        timeZone: 'UTC',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      });
                    })()}
                  </span>
                ),
              },
              {
                id: 'status',
                name: 'Status',
                template: (account) => (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    account.is_active 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {account.is_active ? 'Active' : 'Closed'}
                  </span>
                ),
              },
              {
                id: 'actions',
                name: 'Actions',
                template: (account) => (
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleEditAccount(account); }}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.account_id); }}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ];

            const sortedGroupAccounts = [...groupAccounts].sort((a, b) => {
              const orderA = a.order ?? 0;
              const orderB = b.order ?? 0;
              if (orderA !== orderB) return orderA - orderB;
              return a.account_id - b.account_id;
            });

            return (
              <div key={groupName} className="space-y-4">
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-semibold text-foreground">{groupName}</h2>
                  <span className="text-sm text-muted-foreground">({groupAccounts.length} account{groupAccounts.length !== 1 ? 's' : ''})</span>
                </div>
                <Table
                  columns={columns}
                  data={sortedGroupAccounts}
                  getRowDescriptor={(item) => ({ id: String(item.account_id) })}
                  onRowClick={(item) => navigate(`/accounts/${item.account_id}/transactions`)}
                  className="compact-table w-full"
                />
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && lookupData && (
        <AccountModal
          account={editingAccount}
          lookupData={lookupData}
          onClose={handleModalClose}
          onSave={handleAccountSaved}
        />
      )}
    </div>
  );
}
