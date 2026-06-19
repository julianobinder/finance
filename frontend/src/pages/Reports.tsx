import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Award, ListOrdered
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer 
} from 'recharts';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const CHART_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#ef4444'  // Red
];

interface BI_Transaction {
  transaction_id: number;
  amount: number;
  date: string;
  category_id: number | null;
  category_name: string;
  subcategory_id: number | null;
  subcategory_name: string;
  account_id: number;
  account_name: string;
  account_group_ids: number[];
  payee_name: string;
  type: 'withdrawal' | 'deposit' | 'transfer';
  currency_code: string;
}

interface AccountLookup {
  account_id: number;
  name: string;
  currency_symbol: string;
}

interface AccountGroupLookup {
  account_group_id: number;
  name: string;
  account_ids: number[];
}

interface CategoryLookup {
  category_id: number;
  name: string;
  parent_category_id: number | null;
  is_hidden: boolean;
}

const getCookie = (name: string): string | null => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

const setCookie = (name: string, value: string, days: number = 365) => {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
};

interface CurrencyLookup {
  currency_id: number;
  name: string;
  iso_code: string;
  symbol: string;
}

interface MultiselectDropdownProps {
  label: string;
  options: { id: number; name: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
}

function MultiselectDropdown({ label, options, selectedIds, onChange, placeholder }: MultiselectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="relative inline-block text-left text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">{label}</span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex justify-between items-center w-48 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none h-8 transition-all"
        >
          <span className="truncate">
            {selectedIds.length === 0 
              ? placeholder 
              : `${selectedIds.length} Selected`}
          </span>
          <svg className="ml-2 h-3.5 w-3.5 text-slate-400 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-1 w-56 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl z-20 max-h-60 overflow-y-auto p-1.5 animate-in fade-in duration-100">
            <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 dark:border-slate-900 mb-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Options</span>
              {selectedIds.length > 0 && (
                <button 
                  onClick={clearAll}
                  className="text-[10px] text-rose-500 hover:text-rose-600 font-semibold"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {options.map(opt => {
                const isChecked = selectedIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleOption(opt.id)}
                    className={`flex items-center w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      isChecked 
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      className="mr-2 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="truncate">{opt.name}</span>
                  </button>
                );
              })}
              {options.length === 0 && (
                <div className="px-2 py-3 text-center text-slate-400 text-xs">
                  No options available
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Reports() {
  const [transactions, setTransactions] = useState<BI_Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryLookup[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyLookup[]>([]);
  const [consolidatedBalances, setConsolidatedBalances] = useState<{ [currency: string]: number } | null>(null);
  const [rates, setRates] = useState<{ [currency: string]: number }>({
    USD: 1.0,
    GBP: 0.78,
    EUR: 0.92,
    BRL: 5.25
  });
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
    const saved = getCookie('base_currency');
    return saved || 'EUR';
  });
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [selectedSubcategoryName, setSelectedSubcategoryName] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountLookup[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroupLookup[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [flowDirection, setFlowDirection] = useState<'incoming' | 'outgoing'>('outgoing');
  const [loading, setLoading] = useState(true);

  const displayCurrencies = useMemo(() => {
    return currencies.length > 0 ? currencies : [
      { currency_id: 1, name: 'Euro', iso_code: 'EUR', symbol: '€' },
      { currency_id: 2, name: 'Pound Sterling', iso_code: 'GBP', symbol: '£' },
      { currency_id: 3, name: 'US Dollar', iso_code: 'USD', symbol: '$' },
      { currency_id: 4, name: 'Brazilian Real', iso_code: 'BRL', symbol: 'R$' }
    ];
  }, [currencies]);

  useEffect(() => {
    setCookie('base_currency', selectedCurrency);
  }, [selectedCurrency]);

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return formatDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [dataRes, balancesRes] = await Promise.all([
          api.get('/reports/data/'),
          api.get('/accounts/consolidated-balances/')
        ]);
        setTransactions(dataRes.data.transactions || []);
        setCategories(dataRes.data.categories || []);
        setCurrencies(dataRes.data.currencies || []);
        setAccounts(dataRes.data.accounts || []);
        setAccountGroups(dataRes.data.account_groups || []);
        setConsolidatedBalances(balancesRes.data.consolidated_balances || null);
        if (balancesRes.data.rates) {
          setRates(balancesRes.data.rates);
        }
      } catch (err) {
        console.error('Failed to load reports data', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const convertAmount = (amount: number, fromCurrency: string) => {
    const from = (fromCurrency || 'USD').toUpperCase();
    const to = selectedCurrency.toUpperCase();
    if (from === to) return amount;
    const rateFrom = rates[from] || 1.0;
    const rateTo = rates[to] || 1.0;
    return (amount / rateFrom) * rateTo;
  };

  const hiddenCategoryIds = useMemo(() => {
    return new Set(categories.filter(c => c.is_hidden).map(c => c.category_id));
  }, [categories]);

  const isTxCategoryHidden = (tx: BI_Transaction) => {
    if (tx.category_id && hiddenCategoryIds.has(tx.category_id)) return true;
    if (tx.subcategory_id && hiddenCategoryIds.has(tx.subcategory_id)) return true;
    return false;
  };

  const globallyFilteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      if (startDate && tx.date < startDate) return false;
      if (endDate && tx.date > endDate) return false;
      
      const targetType = flowDirection === 'incoming' ? 'deposit' : 'withdrawal';
      if (tx.type !== targetType) return false;

      if (selectedAccountIds.length > 0 && !selectedAccountIds.includes(tx.account_id)) {
        return false;
      }

      if (selectedGroupIds.length > 0) {
        const matchesGroup = tx.account_group_ids && tx.account_group_ids.some(gid => selectedGroupIds.includes(gid));
        if (!matchesGroup) return false;
      }

      return true;
    });
  }, [transactions, startDate, endDate, flowDirection, selectedAccountIds, selectedGroupIds]);

  const categorySpendingChart = useMemo(() => {
    const groups: { [name: string]: number } = {};
    globallyFilteredTxs.forEach(tx => {
      if (!isTxCategoryHidden(tx)) {
        const cat = tx.category_name || 'Uncategorized';
        const converted = convertAmount(Math.abs(tx.amount), tx.currency_code);
        groups[cat] = (groups[cat] || 0) + converted;
      }
    });
    return Object.entries(groups)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [globallyFilteredTxs, hiddenCategoryIds, selectedCurrency, rates]);

  const subcategorySpendingChart = useMemo(() => {
    const groups: { [name: string]: number } = {};
    globallyFilteredTxs.forEach(tx => {
      if (!isTxCategoryHidden(tx)) {
        if (selectedCategoryName && tx.category_name !== selectedCategoryName) {
          return;
        }
        const sub = tx.subcategory_name || tx.category_name || 'Uncategorized';
        const converted = convertAmount(Math.abs(tx.amount), tx.currency_code);
        groups[sub] = (groups[sub] || 0) + converted;
      }
    });
    return Object.entries(groups)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [globallyFilteredTxs, hiddenCategoryIds, selectedCurrency, rates, selectedCategoryName]);

  const payeeSpendingChart = useMemo(() => {
    const groups: { [name: string]: number } = {};
    globallyFilteredTxs.forEach(tx => {
      if (!isTxCategoryHidden(tx)) {
        if (selectedCategoryName && tx.category_name !== selectedCategoryName) {
          return;
        }
        if (selectedSubcategoryName && (tx.subcategory_name || tx.category_name || 'Uncategorized') !== selectedSubcategoryName) {
          return;
        }
        const payee = tx.payee_name || 'Unknown Payee';
        const converted = convertAmount(Math.abs(tx.amount), tx.currency_code);
        groups[payee] = (groups[payee] || 0) + converted;
      }
    });
    return Object.entries(groups)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [globallyFilteredTxs, hiddenCategoryIds, selectedCurrency, rates, selectedCategoryName, selectedSubcategoryName]);



  const getCurrencySymbol = (isoCode: string): string => {
    const found = displayCurrencies.find(c => c.iso_code === isoCode.toUpperCase());
    return found ? found.symbol : isoCode;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl flex flex-col items-center justify-center min-h-[400px] gap-3">
        <TrendingUp className="h-10 w-10 text-indigo-600 animate-bounce" />
        <span className="text-sm font-semibold text-slate-500">Loading intelligence data...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Financial Intelligence Reports
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {displayCurrencies.map(cur => {
            const isSelected = cur.iso_code === selectedCurrency;
            return (
              <button
                key={cur.iso_code}
                onClick={() => setSelectedCurrency(cur.iso_code)}
                title={`${cur.name} (${cur.iso_code})`}
                className={`h-12 w-12 rounded-full flex flex-col items-center justify-center transition-all duration-200 border text-center ${
                  isSelected
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 border-2 font-bold scale-105 shadow-sm shadow-emerald-50/50 dark:shadow-none'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:text-slate-700 dark:hover:text-slate-350 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span className="text-[10px] leading-none font-bold uppercase">{cur.iso_code}</span>
                <span className={`text-[9px] mt-0.5 leading-none ${isSelected ? 'text-emerald-500/80 dark:text-emerald-400/80' : 'text-slate-400 dark:text-slate-500'}`}>{`(${cur.symbol})`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {consolidatedBalances && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {['GBP', 'EUR', 'USD', 'BRL'].map(cur => {
            const balance = consolidatedBalances[cur] ?? 0;
            const symbol = getCurrencySymbol(cur);
            const formattedBalance = Math.abs(balance).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            const isNegative = balance < 0;
            const isPositive = balance > 0;
            
            let accentBg = 'bg-slate-50 dark:bg-slate-900/30';
            let iconColor = 'text-slate-400';
            let textColor = 'text-slate-900 dark:text-slate-100';
            
            if (isNegative) {
              accentBg = 'bg-rose-50/50 dark:bg-rose-950/10';
              iconColor = 'text-rose-500';
              textColor = 'text-rose-600 dark:text-rose-400';
            } else if (isPositive) {
              accentBg = 'bg-emerald-50/50 dark:bg-emerald-950/10';
              iconColor = 'text-emerald-500';
              textColor = 'text-emerald-600 dark:text-emerald-400';
            }

            const rateToSelected = rates[selectedCurrency] / rates[cur];
            const isSelected = cur === selectedCurrency;
            const rateText = isSelected 
              ? 'Selected currency'
              : `1 ${cur} = ${getCurrencySymbol(selectedCurrency)}${rateToSelected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

            return (
              <div 
                key={cur}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-md"
              >
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                    Total in {cur}
                  </span>
                  <span className={`text-base font-bold mt-0.5 block ${textColor}`}>
                    {isNegative ? '-' : ''}{symbol} {formattedBalance}
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block mt-0.5">
                    {rateText}
                  </span>
                </div>
                <div className={`h-8 w-8 rounded-full ${accentBg} flex items-center justify-center shrink-0 ml-2`}>
                  {cur === 'GBP' ? (
                    <span className={`text-xs font-bold ${iconColor}`}>£</span>
                  ) : cur === 'EUR' ? (
                    <span className={`text-xs font-bold ${iconColor}`}>€</span>
                  ) : cur === 'USD' ? (
                    <span className={`text-xs font-bold ${iconColor}`}>$</span>
                  ) : (
                    <span className={`text-xs font-bold ${iconColor}`}>R$</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Date Range</span>
            <div className="flex items-center gap-2">
              <Input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="h-8 text-[11px] w-28 px-2" 
              />
              <span className="text-slate-400 text-xs">to</span>
              <Input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="h-8 text-[11px] w-28 px-2" 
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Flow Direction</span>
            <div className="flex bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg h-8 items-center">
              <button
                onClick={() => setFlowDirection('outgoing')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all h-7 flex items-center ${
                  flowDirection === 'outgoing'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                }`}
              >
                Outgoing
              </button>
              <button
                onClick={() => setFlowDirection('incoming')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all h-7 flex items-center ${
                  flowDirection === 'incoming'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                }`}
              >
                Incoming
              </button>
            </div>
          </div>

          <MultiselectDropdown 
            label="Accounts"
            options={accounts.map(a => ({ id: a.account_id, name: a.name }))}
            selectedIds={selectedAccountIds}
            onChange={setSelectedAccountIds}
            placeholder="All Accounts"
          />

          <MultiselectDropdown 
            label="Account Groups"
            options={accountGroups.map(g => ({ id: g.account_group_id, name: g.name }))}
            selectedIds={selectedGroupIds}
            onChange={setSelectedGroupIds}
            placeholder="All Groups"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between min-h-[380px]">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b pb-2 mb-4">
              <Award className="h-4 w-4 text-indigo-500" />
              Total Amount by Category
            </h3>
            {categorySpendingChart.length > 0 ? (
              <div className="h-64 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySpendingChart}
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      dataKey="value"
                      label={({ cx, percent, name, x, y }) => {
                        if (percent < 0.03) return null;
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#475569"
                            className="text-[10px] font-semibold dark:fill-slate-300 animate-fade-in"
                            textAnchor={x > cx ? 'start' : 'end'}
                            dominantBaseline="central"
                          >
                            {`${name} (${(percent * 100).toFixed(0)}%)`}
                          </text>
                        );
                      }}
                      labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                      onClick={(data) => {
                        if (data && data.name) {
                          setSelectedCategoryName(prev => {
                            const next = prev === data.name ? null : data.name;
                            setSelectedSubcategoryName(null);
                            return next;
                          });
                        }
                      }}
                    >
                      {categorySpendingChart.map((entry, index) => {
                        const isSelected = entry.name === selectedCategoryName;
                        const hasSelection = selectedCategoryName !== null;
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={CHART_COLORS[index % CHART_COLORS.length]} 
                            opacity={hasSelection && !isSelected ? 0.4 : 1.0}
                            stroke={isSelected ? '#4f46e5' : '#fff'}
                            strokeWidth={isSelected ? 2 : 1}
                            style={{ cursor: 'pointer', outline: 'none' }}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${getCurrencySymbol(selectedCurrency)}${Number(value).toLocaleString()}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <span className="text-xs">No spending category data.</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between min-h-[380px]">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between border-b pb-2 mb-4">
              <span className="flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-indigo-500" />
                Total Amount by Sub-category
                {selectedCategoryName && (
                  <Badge variant="secondary" className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 font-semibold">
                    Filtered by: {selectedCategoryName}
                  </Badge>
                )}
                {selectedSubcategoryName && (
                  <Badge variant="secondary" className="ml-2 text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold">
                    Selected: {selectedSubcategoryName}
                  </Badge>
                )}
              </span>
              {(selectedCategoryName || selectedSubcategoryName) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedCategoryName(null);
                    setSelectedSubcategoryName(null);
                  }}
                  className="h-6 text-[10px] text-slate-500 hover:text-rose-600"
                >
                  Clear Filter
                </Button>
              )}
            </h3>
            {subcategorySpendingChart.length > 0 ? (
              <div className="h-64 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={subcategorySpendingChart}
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      dataKey="value"
                      label={({ cx, percent, name, x, y }) => {
                        if (percent < 0.03) return null;
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#475569"
                            className="text-[10px] font-semibold dark:fill-slate-300 animate-fade-in"
                            textAnchor={x > cx ? 'start' : 'end'}
                            dominantBaseline="central"
                          >
                            {`${name} (${(percent * 100).toFixed(0)}%)`}
                          </text>
                        );
                      }}
                      labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                      onClick={(data) => {
                        if (data && data.name) {
                          setSelectedSubcategoryName(prev => prev === data.name ? null : data.name);
                        }
                      }}
                    >
                      {subcategorySpendingChart.map((entry, index) => {
                        const isSelected = entry.name === selectedSubcategoryName;
                        const hasSelection = selectedSubcategoryName !== null;
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={CHART_COLORS[index % CHART_COLORS.length]} 
                            opacity={hasSelection && !isSelected ? 0.4 : 1.0}
                            stroke={isSelected ? '#4f46e5' : '#fff'}
                            strokeWidth={isSelected ? 2 : 1}
                            style={{ cursor: 'pointer', outline: 'none' }}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${getCurrencySymbol(selectedCurrency)}${Number(value).toLocaleString()}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <span className="text-xs">No spending subcategory data.</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between min-h-[380px]">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between border-b pb-2 mb-4">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                Total Amount by Payee
                {selectedSubcategoryName && (
                  <Badge variant="secondary" className="ml-2 text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold">
                    Sub-category: {selectedSubcategoryName}
                  </Badge>
                )}
                {!selectedSubcategoryName && selectedCategoryName && (
                  <Badge variant="secondary" className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 font-semibold">
                    Category: {selectedCategoryName}
                  </Badge>
                )}
              </span>
              {(selectedCategoryName || selectedSubcategoryName) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedCategoryName(null);
                    setSelectedSubcategoryName(null);
                  }}
                  className="h-6 text-[10px] text-slate-500 hover:text-rose-600"
                >
                  Clear Filters
                </Button>
              )}
            </h3>
            {payeeSpendingChart.length > 0 ? (
              <div className="h-64 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={payeeSpendingChart}
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      dataKey="value"
                      label={({ cx, percent, name, x, y }) => {
                        if (percent < 0.03) return null;
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#475569"
                            className="text-[10px] font-semibold dark:fill-slate-300 animate-fade-in"
                            textAnchor={x > cx ? 'start' : 'end'}
                            dominantBaseline="central"
                          >
                            {`${name} (${(percent * 100).toFixed(0)}%)`}
                          </text>
                        );
                      }}
                      labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                    >
                      {payeeSpendingChart.map((_, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={CHART_COLORS[index % CHART_COLORS.length]} 
                          stroke="#fff"
                          strokeWidth={1}
                          style={{ outline: 'none' }}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${getCurrencySymbol(selectedCurrency)}${Number(value).toLocaleString()}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <span className="text-xs">No spending payee data.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
