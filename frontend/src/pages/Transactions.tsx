import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Dialog, Select, Pagination, Loader, Alert, TableColumnConfig, TextInput } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Upload as UploadIcon } from 'lucide-react';

import { TransactionModal } from '../components/Transaction/TransactionModal';
import api from '../services/api';
import { showWarning, showError, showSuccess } from '../utils/notifications';

const dateFilterOptions = [
  { value: 'all', content: 'All Dates' },
  { value: 'past', content: 'Past' },
  { value: 'future', content: 'Future' },
  { value: 'last7', content: 'Last 7 Days' },
  { value: 'last30', content: 'Last 30 Days' },
  { value: 'this_month', content: 'This Month' },
  { value: 'this_year', content: 'This Year' },
];

interface Transaction {
  transaction_id: number;
  transaction_type_id?: number;
  transactiontype_name?: string;
  account?: number;
  account_name?: string;
  status?: number;
  status_name?: string;
  entry: string;
  issue: string;
  received?: string;
  referto?: string;
  due?: string;
  payment?: string;
  cash?: string;
  date?: string; // Alias for cash, used in table display
  payee_id?: number;
  payee_name?: string;
  category_id?: number;
  category_name?: string;
  subcategory_name?: string;
  comment?: string;
  rate?: number;
  amount: number;
  reference?: string;
  transfer_transaction_id?: number;
  to_account_id?: number;
  to_account_name?: string;
  to_account_cash?: string;
  to_account_issue?: string;
  to_account_received?: string;
  to_account_referto?: string;
  to_account_due?: string;
  to_account_payment?: string;
  to_account_amount?: number;
  original_amount?: number;
  original_currency_id?: number;
  original_currency_code?: string;
  original_currency_symbol?: string;
  is_split?: boolean;
  balance?: number;
}

interface Account {
  account_id: number;
  name: string;
  titular_name: string;
  currency_id: number;
  currency_name: string;
  currency_symbol: string;
  balance: number;
  string_name?: string;
  full_name?: string;
}

interface ImportPlan {
  import_plan_id: number;
  name: string;
  account_id: number;
  account_name: string;
  import_csv_id: number;
  import_csv_name: string;
  rules_count: number;
  rules: ImportPlanRule[];
}

interface ImportPlanRule {
  import_plan_rule_id: number;
  import_plan_id: number;
  import_csv_field_id: number;
  import_csv_field_name: string;
  pattern: string;
  order: number;
  ignore: boolean;
  payee_id: number | null;
  payee_name: string | null;
  category_id: number | null;
  category_name: string | null;
  to_account_id: number | null;
  to_account_name: string | null;
  match_type?: 'equals' | 'contains';
}

interface ImportCsvField {
  import_csv_field_id: number;
  name: string;
  map?: string;
  map_field?: string;
  format?: string;
  format_field?: string;
  fieldtype?: string;
  type_field?: string;
}

interface ImportCSV {
  import_csv_id: number;
  name: string;
  fields: ImportCsvField[];
}

interface TransactionImport {
  date: string;
  payment_date?: string;
  amount: number;
  comments?: string;
  reference?: string;
  payee_desc?: string;
  currency_id?: string;
  has_a_plan: boolean;
  payee_id?: number;
  category_id?: number;
  to_account_id?: number;
  fee?: number;
  original_amount?: number;
  original_currency_id?: string;
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

const setCookie = (name: string, value: string, days = 365) => {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
};

export function Transactions() {
  const { accountId } = useParams<{ accountId: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [displayDateType, setDisplayDateType] = useState<string>(() => {
    if (accountId) {
      return getCookie(`display_date_type_account_${accountId}`) || 'cash';
    }
    return 'cash';
  });
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPlans, setImportPlans] = useState<ImportPlan[]>([]);
  const [selectedImportPlan, setSelectedImportPlan] = useState<string | undefined>(undefined);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [csvTemplate, setCsvTemplate] = useState<ImportCSV | null>(null);
  const [importResults, setImportResults] = useState<{
    total: number;
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  
  // Statement Reconciliation State
  const [startBalance, setStartBalance] = useState<string>('');
  const [endBalance, setEndBalance] = useState<string>('');
  const [isReconcileWarningOpen, setIsReconcileWarningOpen] = useState(false);
  const [reconcileWarningDetails, setReconcileWarningDetails] = useState<{
    start: number;
    end: number;
    expected: number;
    sum: number;
    diff: number;
    payloads: any[];
  } | null>(null);
  const [reconcileDuplicates, setReconcileDuplicates] = useState<{
    csvDuplicates: any[];
    dbMatches: any[];
  }>({ csvDuplicates: [], dbMatches: [] });

  // Import Wizard State
  const [importWizardItems, setImportWizardItems] = useState<any[]>([]);
  const [currentWizardIndex, setCurrentWizardIndex] = useState<number>(-1);
  const [isImportWizardModalOpen, setIsImportWizardModalOpen] = useState<boolean>(false);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  // const [allPayees, setAllPayees] = useState<any[]>([]);
  const [allCurrencies, setAllCurrencies] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAccountAndTransactions = useCallback(async () => {
    if (!accountId) {
      setError("Account ID is missing.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      
      const accountResponse = await api.get(`/accounts/${accountId}/`);
      setAccount(accountResponse.data);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: pageSize.toString(),
      });
      
      if (dateFilter) {
        params.append('date_filter', dateFilter);
      }
      
      const transactionsResponse = await api.get(`/accounts/${accountId}/transactions/`, { params });
      setTransactions(transactionsResponse.data.results || []);
      setTotalCount(transactionsResponse.data.count || 0);

    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to fetch data');
      setAccount(null);
      setTransactions([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [accountId, currentPage, pageSize, dateFilter]);
  
  const loadLookupData = async () => {
    try {
      const response = await api.get('/transactions/lookup-data/');
      setAllCategories(response.data?.categories || []);
      setAllAccounts(response.data?.accounts || []);
      // setAllPayees(response.data?.payees || []);
      setAllCurrencies(response.data?.currencies || []);
    } catch (error) {
      console.error('Failed to load lookup data:', error);
    }
  };

  useEffect(() => {
    fetchAccountAndTransactions();
    loadLookupData();
  }, [fetchAccountAndTransactions]);

  useEffect(() => {
    if (accountId) {
      const persisted = getCookie(`display_date_type_account_${accountId}`);
      setDisplayDateType(persisted || 'cash');
    }
  }, [accountId]);

  const handleUpdateDisplayDateType = (val: string) => {
    setDisplayDateType(val);
    if (accountId) {
      setCookie(`display_date_type_account_${accountId}`, val);
    }
  };

  const loadImportPlans = async () => {
    if (!accountId) return;
    try {
      const response = await api.get('/accounts/import-plans/');
      const allPlans: ImportPlan[] = response.data.results || response.data;
      const accountPlans = allPlans.filter(plan => plan.account_id === parseInt(accountId));
      setImportPlans(accountPlans);
    } catch (error) {
      console.error('Error loading import plans:', error);
    }
  };

  const loadCsvTemplate = async (templateId: number) => {
    try {
      const response = await api.get(`/accounts/csv-templates/${templateId}/`);
      setCsvTemplate(response.data);
    } catch (error) {
      console.error('Error loading CSV template:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatDateWithOrdinal = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getUTCDate();
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    
    // Get ordinal suffix
    const getOrdinalSuffix = (n: number) => {
      const j = n % 10;
      const k = n % 100;
      if (j === 1 && k !== 11) return 'st';
      if (j === 2 && k !== 12) return 'nd';
      if (j === 3 && k !== 13) return 'rd';
      return 'th';
    };
    
    const suffix = getOrdinalSuffix(day);
    
    return (
      <>
        {month} {day}
        <sup style={{ fontSize: '0.7em', lineHeight: 0 }}>{suffix}</sup> {year}
      </>
    );
  };

  const formatCurrency = (amount: number, symbol: string) => {
    return `${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleAddTransaction = () => {
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const handleEditTransaction = async (transaction: Transaction) => {
    if (transaction.category_name === 'Initial Balance') {
      setAlertMessage('Initial balance transactions can only be edited in the account form.');
      setIsAlertOpen(true);
      return;
    }
    try {
      // Fetch full transaction details to ensure we have all fields
      const response = await api.get(`/transactions/${transaction.transaction_id}/`);
      if (response.data?.category_name === 'Initial Balance') {
        setAlertMessage('Initial balance transactions can only be edited in the account form.');
        setIsAlertOpen(true);
        return;
      }
      setEditingTransaction(response.data);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Failed to fetch transaction details:', error);
      showError('Failed to load transaction details');
      // Fallback to using the transaction from the list
      setEditingTransaction(transaction);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingTransaction(null);
  }, []);

  const handleOpenImportModal = async () => {
    await loadImportPlans();
    setImportResults(null);
    setSelectedFile(null);
    setSelectedImportPlan(undefined);
    setStartBalance('');
    setEndBalance('');
    setIsImportModalOpen(true);
  };

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false);
    setStartBalance('');
    setEndBalance('');
  };
  
  const handleImportPlanChange = async (planId: string) => {
    setSelectedImportPlan(planId);
    const plan = importPlans.find(p => p.import_plan_id.toString() === planId);
    if (plan) {
      await loadCsvTemplate(plan.import_csv_id);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const parseCsvFile = async (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const csvData = lines.map(line => {
          // Simple CSV parsing - handles basic cases
          const result = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        });
        resolve(csvData);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const applyImportRules = (
    transaction: TransactionImport,
    csvRow: string[],
    headers: string[],
    rules: ImportPlanRule[]
  ): { matchedRule: ImportPlanRule | null; isIgnored: boolean } => {
    for (const rule of rules) {
      const templateField = csvTemplate?.fields.find(f => f.import_csv_field_id === rule.import_csv_field_id);
      if (!templateField) continue;
      
      const csvFieldIndex = headers.findIndex(h => h.toLowerCase() === templateField.name.toLowerCase());
      if (csvFieldIndex === -1) continue;
      
      const value = csvRow[csvFieldIndex] || '';
      
      const isEquals = rule.match_type === 'equals';
      const matches = isEquals
        ? value.toLowerCase().trim() === rule.pattern.toLowerCase().trim()
        : value.toLowerCase().includes(rule.pattern.toLowerCase());
        
      if (matches) {
        if (rule.ignore) {
          return { matchedRule: rule, isIgnored: true };
        }
        
        transaction.payee_id = rule.payee_id || undefined;
        transaction.category_id = rule.category_id || undefined;
        transaction.to_account_id = rule.to_account_id || undefined;
        transaction.has_a_plan = true;
        return { matchedRule: rule, isIgnored: false };
      }
    }
    return { matchedRule: null, isIgnored: false };
  };

  const parseTransactionFromCsv = (csvRow: string[], headers: string[]): TransactionImport => {
    const transaction: TransactionImport = {
      date: '',
      amount: 0,
      has_a_plan: false
    };

    if (!csvTemplate) return transaction;

    for (const field of csvTemplate.fields) {
      const fieldIndex = headers.findIndex(h => h.toLowerCase() === field.name.toLowerCase());
      if (fieldIndex === -1) continue;
      
      const value = csvRow[fieldIndex] || '';
      const fieldMap = field.map_field || field.map;
      
      switch (fieldMap) {
        case 'DATE':
        case 'CASH_DATE':
          if (value) {
            try {
              let parsedDate: Date | null = null;
              
              // Handle DD/MM/YYYY or DD-MM-YYYY format
              if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(value)) {
                const separator = value.includes('/') ? '/' : '-';
                const parts = value.split(separator);
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                parsedDate = new Date(Date.UTC(year, month, day));
              } else {
                // Check if it matches YYYY-MM-DD or YYYY/MM/DD with optional time component
                const ymdMatch = value.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (ymdMatch) {
                  const year = parseInt(ymdMatch[1], 10);
                  const month = parseInt(ymdMatch[2], 10) - 1;
                  const day = parseInt(ymdMatch[3], 10);
                  parsedDate = new Date(Date.UTC(year, month, day));
                } else {
                  // Fallback: parse date and extract local/UTC components safely to prevent timezone shift
                  const tempDate = new Date(value);
                  if (tempDate && !isNaN(tempDate.getTime())) {
                    const hasTimezone = /Z|GMT|UTC|[+-]\d{2}(:?\d{2})?/.test(value);
                    if (hasTimezone) {
                      parsedDate = tempDate;
                    } else {
                      // If value starts with YYYY-MM-DD, browsers default-parse as UTC. Others parse as local.
                      const isUTC = /^\d{4}-\d{2}-\d{2}/.test(value.trim());
                      if (isUTC) {
                        parsedDate = new Date(Date.UTC(tempDate.getUTCFullYear(), tempDate.getUTCMonth(), tempDate.getUTCDate()));
                      } else {
                        parsedDate = new Date(Date.UTC(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate()));
                      }
                    }
                  }
                }
              }
              
              if (parsedDate && !isNaN(parsedDate.getTime())) {
                transaction.date = parsedDate.toISOString().split('T')[0];
              } else {
                console.warn('Parsed date evaluated to NaN:', value);
              }
            } catch (e) {
              console.warn('Failed to parse date:', value);
            }
          }
          break;
          
        case 'PAYMENT_DATE':
        case 'PAID_DATE':
          if (value) {
            try {
              let parsedDate: Date | null = null;
              
              // Handle DD/MM/YYYY or DD-MM-YYYY format
              if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(value)) {
                const separator = value.includes('/') ? '/' : '-';
                const parts = value.split(separator);
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                parsedDate = new Date(Date.UTC(year, month, day));
              } else {
                // Check if it matches YYYY-MM-DD or YYYY/MM/DD with optional time component
                const ymdMatch = value.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (ymdMatch) {
                  const year = parseInt(ymdMatch[1], 10);
                  const month = parseInt(ymdMatch[2], 10) - 1;
                  const day = parseInt(ymdMatch[3], 10);
                  parsedDate = new Date(Date.UTC(year, month, day));
                } else {
                  // Fallback: parse date and extract local/UTC components safely to prevent timezone shift
                  const tempDate = new Date(value);
                  if (tempDate && !isNaN(tempDate.getTime())) {
                    const hasTimezone = /Z|GMT|UTC|[+-]\d{2}(:?\d{2})?/.test(value);
                    if (hasTimezone) {
                      parsedDate = tempDate;
                    } else {
                      // If value starts with YYYY-MM-DD, browsers default-parse as UTC. Others parse as local.
                      const isUTC = /^\d{4}-\d{2}-\d{2}/.test(value.trim());
                      if (isUTC) {
                        parsedDate = new Date(Date.UTC(tempDate.getUTCFullYear(), tempDate.getUTCMonth(), tempDate.getUTCDate()));
                      } else {
                        parsedDate = new Date(Date.UTC(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate()));
                      }
                    }
                  }
                }
              }
              
              if (parsedDate && !isNaN(parsedDate.getTime())) {
                transaction.payment_date = parsedDate.toISOString().split('T')[0];
              } else {
                console.warn('Parsed payment date evaluated to NaN:', value);
              }
            } catch (e) {
              console.warn('Failed to parse payment date:', value);
            }
          }
          break;
          
        case 'AMOUNT':
        case '-AMOUNT':
          if (value && value.trim() !== '') {
            try {
              let cleanValue = value.replace(/[^\d.,-]/g, '');
              if (cleanValue.includes(',')) {
                cleanValue = cleanValue.replace(',', '.');
              }
              const parsedVal = parseFloat(cleanValue);
              if (!isNaN(parsedVal)) {
                transaction.amount = fieldMap === '-AMOUNT' ? -parsedVal : parsedVal;
              }
            } catch (e) {
              console.warn('Failed to parse amount:', value);
            }
          }
          break;
          
        case 'FEE':
          if (value && value.trim() !== '') {
            try {
              let cleanValue = value.replace(/[^\d.,-]/g, '');
              if (cleanValue.includes(',')) {
                cleanValue = cleanValue.replace(',', '.');
              }
              const parsedVal = parseFloat(cleanValue);
              if (!isNaN(parsedVal)) {
                transaction.fee = parsedVal;
              }
            } catch (e) {
              console.warn('Failed to parse fee:', value);
            }
          }
          break;

        case 'CURRENCY':
          if (value) {
            transaction.currency_id = value.trim();
          }
          break;

        case 'ORG_CURRENCY':
          if (value) {
            transaction.original_currency_id = value.trim();
          }
          break;

        case 'ORG_AMOUNT':
          if (value && value.trim() !== '') {
            try {
              let cleanValue = value.replace(/[^\d.,-]/g, '');
              if (cleanValue.includes(',')) {
                cleanValue = cleanValue.replace(',', '.');
              }
              const parsedVal = parseFloat(cleanValue);
              if (!isNaN(parsedVal)) {
                transaction.original_amount = parsedVal;
              }
            } catch (e) {
              console.warn('Failed to parse original amount:', value);
            }
          }
          break;
          
        case 'COMMENTS':
          transaction.comments = value;
          break;
          
        case 'REFERENCE':
          transaction.reference = value;
          break;
          
        case 'PAYEE_DESC':
          transaction.payee_desc = value;
          break;
      }
    }

    return transaction;
  };

  const hasEnoughInfo = (tx: TransactionImport): boolean => {
    if (!tx.date || !tx.amount) return false;
    if (tx.to_account_id) {
      // Transfer transaction
      const destAcc = allAccounts.find(a => a.account_id === tx.to_account_id);
      if (!destAcc) return false;
      // Check if transfer is between currencies
      if (account && account.currency_id !== destAcc.currency_id) {
        return false; // Requires currency rate / manual confirmation
      }
      return true;
    } else {
      // Standard transaction
      return !!(tx.payee_id && tx.category_id);
    }
  };

  const getFeeTransactionData = (item: any) => {
    const bankFeeCategory = allCategories.find(c => c.name === 'Bank Fee' && c.parent_category_id === 1045)?.category_id || 
                            allCategories.find(c => c.name === 'Bank Fee')?.category_id || 
                            1082;
    return {
      accountId: parseInt(accountId || '0'),
      cash: item.date,
      amount: -Math.abs(item.fee),
      comment: `Bank Fee: ${item.comments || item.payee_desc || ''}`,
      reference: item.reference || '',
      payee_id: null,
      category_id: bankFeeCategory,
      toAccountId: null,
      transactionType: 'withdrawal'
    };
  };

  const saveImportPayloads = async (payloads: any[]) => {
    setImportLoading(true);
    try {
      await api.post('/transactions/bulk/', payloads);
      showSuccess('CSV Import Completed Successfully!');
      setIsImportWizardModalOpen(false);
      setIsImportModalOpen(false);
      setStartBalance('');
      setEndBalance('');
      setCurrentPage(1);
      await fetchAccountAndTransactions();
    } catch (error) {
      console.error('Error committing import batch:', error);
      showError('CSV Import Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImportWithDiscrepancy = async () => {
    setIsReconcileWarningOpen(false);
    if (reconcileWarningDetails) {
      await saveImportPayloads(reconcileWarningDetails.payloads);
    }
  };

  const detectSameDayOccurrences = async (payloads: any[]) => {
    if (payloads.length === 0) return { csvDuplicates: [], dbMatches: [] };

    // 1. Group by cash date and amount to find identical same-day transactions in the CSV
    const csvGroups: { [key: string]: any[] } = {};
    payloads.forEach(p => {
      const dateStr = p.cash;
      const amt = Math.round(p.amount * 100) / 100;
      const key = `${dateStr}_${amt}`;
      if (!csvGroups[key]) csvGroups[key] = [];
      csvGroups[key].push(p);
    });

    const csvDuplicates: any[] = [];
    Object.values(csvGroups).forEach(group => {
      if (group.length > 1) {
        csvDuplicates.push(...group);
      }
    });

    // 2. Query database for existing transactions in the date range of this import
    const dates = payloads.map(p => p.cash).filter(Boolean);
    if (dates.length === 0) {
      return { csvDuplicates, dbMatches: [] };
    }
    dates.sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const dbMatches: any[] = [];
    try {
      const response = await api.get(`/accounts/${accountId}/transactions/`, {
        params: {
          start_date: minDate,
          end_date: maxDate,
          page_size: 5000
        }
      });
      const dbTxs = response.data.results || [];

      // Check if imported transactions match any database transaction on date and amount
      payloads.forEach(p => {
        const pAmt = Math.round(p.amount * 100) / 100;
        const matchedDbTx = dbTxs.find((dbTx: any) => {
          const dbAmt = Math.round(dbTx.amount * 100) / 100;
          return dbTx.cash === p.cash && dbAmt === pAmt;
        });
        if (matchedDbTx) {
          dbMatches.push({
            payload: p,
            dbTransaction: matchedDbTx
          });
        }
      });
    } catch (err) {
      console.error('Error fetching db transactions for duplicate detection:', err);
    }

    return { csvDuplicates, dbMatches };
  };

  const commitImportBatch = async (items: any[]) => {
    setImportLoading(true);
    try {
      const payloads = [];
      for (const item of items) {
        if (item.isIgnored) continue;
        if (item.resolvedData) {
          payloads.push(item.resolvedData);
          if (item.fee && item.fee > 0) {
            payloads.push(getFeeTransactionData(item));
          }
        }
      }
      
      if (payloads.length === 0) {
        showSuccess('Import completed with no transactions saved');
        setIsImportWizardModalOpen(false);
        setIsImportModalOpen(false);
        setStartBalance('');
        setEndBalance('');
        return;
      }

      // Check balance reconciliation if provided
      const startVal = parseFloat(startBalance);
      const endVal = parseFloat(endBalance);
      if (!isNaN(startVal) && !isNaN(endVal)) {
        const totalImportAmount = payloads.reduce((sum, p) => sum + p.amount, 0);
        // Round to 2 decimal places to avoid floating point math comparison issues
        const expectedEnd = Math.round((startVal + totalImportAmount) * 100) / 100;
        const roundedEndVal = Math.round(endVal * 100) / 100;
        const diff = Math.round((roundedEndVal - expectedEnd) * 100) / 100;
        if (Math.abs(diff) > 0.01) {
          const duplicates = await detectSameDayOccurrences(payloads);
          setReconcileDuplicates(duplicates);

          setReconcileWarningDetails({
            start: startVal,
            end: endVal,
            expected: expectedEnd,
            sum: totalImportAmount,
            diff: diff,
            payloads: payloads
          });
          setIsReconcileWarningOpen(true);
          setImportLoading(false);
          return;
        }
      }
      
      await saveImportPayloads(payloads);
    } catch (error) {
      console.error('Error committing import batch:', error);
      showError('CSV Import Failed', error instanceof Error ? error.message : 'Unknown error');
      setImportLoading(false);
    }
  };

  const handleWizardSave = async (transactionData: any) => {
    const updatedItems = [...importWizardItems];
    const currentItem = { ...updatedItems[currentWizardIndex] };
    currentItem.resolvedData = transactionData;
    currentItem.isMatched = true;
    updatedItems[currentWizardIndex] = currentItem;
    setImportWizardItems(updatedItems);
    
    const nextPendingIndex = updatedItems.findIndex((item, idx) => idx > currentWizardIndex && !item.isIgnored && !item.isMatched);
    
    if (nextPendingIndex !== -1) {
      setCurrentWizardIndex(nextPendingIndex);
    } else {
      await commitImportBatch(updatedItems);
    }
  };

  const handleWizardIgnore = async () => {
    const updatedItems = [...importWizardItems];
    const currentItem = { ...updatedItems[currentWizardIndex] };
    currentItem.isIgnored = true;
    updatedItems[currentWizardIndex] = currentItem;
    setImportWizardItems(updatedItems);
    
    const nextPendingIndex = updatedItems.findIndex((item, idx) => idx > currentWizardIndex && !item.isIgnored && !item.isMatched);
    
    if (nextPendingIndex !== -1) {
      setCurrentWizardIndex(nextPendingIndex);
    } else {
      await commitImportBatch(updatedItems);
    }
  };

  const handleWizardCancel = () => {
    setIsImportWizardModalOpen(false);
    setImportWizardItems([]);
    setCurrentWizardIndex(-1);
    showWarning('Import Cancelled', 'CSV import was aborted. No transactions were saved.');
  };

  const handleImportCSV = async () => {
    if (importLoading) return;
    if (!selectedImportPlan || !selectedFile || !csvTemplate) {
      showWarning('Missing Information', 'Please select an import plan and a CSV file');
      return;
    }

    setImportLoading(true);
    setImportResults(null);

    try {
      const csvData = await parseCsvFile(selectedFile);
      if (csvData.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row');
      }

      const headers = csvData[0];
      const dataRows = csvData.slice(1);
      
      const selectedPlan = importPlans.find(p => p.import_plan_id.toString() === selectedImportPlan);
      if (!selectedPlan) {
        throw new Error('Selected import plan not found');
      }

      // Map rows and pre-parse
      const parsedItems = dataRows.map((csvRow, idx) => {
        const transaction = parseTransactionFromCsv(csvRow, headers);
        
        // Resolve original currency string to integer ID if present
        if (transaction.original_currency_id) {
          const orgCurrencyField = csvTemplate.fields.find(f => (f.map_field || f.map) === 'ORG_CURRENCY');
          const formatType = (orgCurrencyField?.format_field || orgCurrencyField?.format || '').trim().toUpperCase();
          
          const valueToSearch = transaction.original_currency_id.trim().toLowerCase();
          
          let matched = null;
          if (formatType === 'ISO') {
            matched = allCurrencies.find(c => c.iso_code.toLowerCase() === valueToSearch);
          } else if (formatType === 'SYMBOL') {
            matched = allCurrencies.find(c => c.symbol.toLowerCase() === valueToSearch);
          } else {
            // Default fallback: search by ISO code first, then by symbol
            matched = allCurrencies.find(c => c.iso_code.toLowerCase() === valueToSearch) ||
                      allCurrencies.find(c => c.symbol.toLowerCase() === valueToSearch) ||
                      allCurrencies.find(c => String(c.currency_id) === valueToSearch);
          }
          
          if (matched) {
            transaction.original_currency_id = String(matched.currency_id);
          } else {
            const isNumeric = /^\d+$/.test(transaction.original_currency_id);
            if (!isNumeric) {
              transaction.original_currency_id = undefined;
            }
          }
        }
        
        return { csvRow, transaction, originalIndex: idx };
      });

      // Sort chronological: oldest to newest
      const parseDateSafe = (dStr: string) => {
        const t = Date.parse(dStr);
        return isNaN(t) ? 0 : t;
      };
      parsedItems.sort((a, b) => parseDateSafe(a.transaction.date) - parseDateSafe(b.transaction.date));

      const wizardItems: any[] = [];

      for (const item of parsedItems) {
        let tx = item.transaction;
        if (!tx.date || tx.amount === 0) continue;
        
        const { matchedRule, isIgnored } = applyImportRules(tx, item.csvRow, headers, selectedPlan.rules);
        
        const wizardItem: any = {
          date: tx.date,
          payment_date: tx.payment_date,
          amount: tx.amount,
          comments: tx.comments,
          reference: tx.reference,
          payee_desc: tx.payee_desc,
          currency_id: tx.currency_id,
          fee: tx.fee,
          payee_id: tx.payee_id,
          category_id: tx.category_id,
          to_account_id: tx.to_account_id,
          original_currency_id: tx.original_currency_id,
          original_amount: tx.original_amount,
          isMatched: false,
          isIgnored: isIgnored,
          csvRow: item.csvRow,
          resolvedData: null
        };
        
        if (isIgnored) {
          wizardItems.push(wizardItem);
          continue;
        }

        const enoughInfo = hasEnoughInfo(tx);
        if (matchedRule && enoughInfo) {
          wizardItem.isMatched = true;
          const resolved: any = {
            accountId: parseInt(accountId || '0'),
            cash: tx.date,
            payment: tx.payment_date || null,
            amount: tx.amount,
            comment: tx.comments || '',
            reference: tx.reference || '',
            payee_id: tx.payee_id || null,
            category_id: tx.category_id || null,
            toAccountId: tx.to_account_id || null,
            original_currency_id: tx.original_currency_id ? parseInt(tx.original_currency_id, 10) : null,
            original_amount: tx.original_amount !== undefined ? tx.original_amount : null,
            transactionType: tx.to_account_id ? 'transfer' : (tx.amount > 0 ? 'deposit' : 'withdrawal')
          };
          if (tx.to_account_id) {
            resolved.toAccountCash = tx.date;
            resolved.toAccountPayment = tx.payment_date || null;
          }
          wizardItem.resolvedData = resolved;
        }
        
        wizardItems.push(wizardItem);
      }

      const firstPendingIndex = wizardItems.findIndex(item => !item.isIgnored && !item.isMatched);
      
      if (firstPendingIndex === -1) {
        await commitImportBatch(wizardItems);
      } else {
        setIsImportModalOpen(false);
        setImportWizardItems(wizardItems);
        setCurrentWizardIndex(firstPendingIndex);
        setIsImportWizardModalOpen(true);
      }
      
    } catch (error) {
      console.error('Error importing CSV:', error);
      showError('CSV Import Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleSaveTransaction = async (transactionData: any, transactionId: number | null = null): Promise<void> => {
    try {
      if (transactionId) {
        await api.put(`/transactions/${transactionId}/`, transactionData);
        showSuccess('Transaction updated successfully');
      } else {
        await api.post('/transactions/', transactionData);
        showSuccess('Transaction created successfully');
      }
      handleCloseModal();
      setTimeout(() => {
        fetchAccountAndTransactions();
      }, 300);
    } catch (error) {
      console.error('Failed to save transaction:', error);
      showError('Failed to save transaction', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    try {
      await api.delete(`/transactions/${transactionId}/`);
      showSuccess('Transaction deleted successfully');
      handleCloseModal();
      setTimeout(() => {
        fetchAccountAndTransactions();
      }, 300);
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      showError('Failed to delete transaction', error instanceof Error ? error.message : 'Unknown error');
    }
  };
  
  if (loading && !account) {
    return <div className="flex justify-center items-center h-screen"><Loader size="l" /></div>;
  }

  if (error) {
    return <Alert theme="danger" title="Error" message={error} onClose={() => setError(null)} />;
  }
  
  if (!account) {
    return <Alert theme="warning" message="Account not found." />;
  }

  // Get the latest transaction date
  const getLatestTransactionDate = () => {
    if (!transactions || transactions.length === 0) return null;
    
    const dates = transactions
      .map(t => {
        const dateStr = t.date || t.cash || t.issue || t.entry;
        return dateStr ? new Date(dateStr).getTime() : 0;
      })
      .filter(ts => ts > 0);
    
    if (dates.length === 0) return null;
    
    const latestTimestamp = Math.max(...dates);
    const latestTransaction = transactions.find(t => {
      const dateStr = t.date || t.cash || t.issue || t.entry;
      return dateStr && new Date(dateStr).getTime() === latestTimestamp;
    });
    
    return latestTransaction ? (latestTransaction.date || latestTransaction.cash || latestTransaction.issue || latestTransaction.entry) : null;
  };

  const latestTransactionDate = getLatestTransactionDate();

  const getTransactionDisplayDate = (record: Transaction) => {
    if (displayDateType === 'cash') {
      return record.cash || record.date;
    }
    const chosenDate = record[displayDateType as keyof Transaction] as string | undefined;
    return chosenDate || record.cash || record.date;
  };

  const columns: TableColumnConfig<Transaction>[] = [
    {
      id: 'date',
      width: '14%',
      name: () => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="font-bold mr-1">Date:</span>
          <Select
            size="s"
            value={[displayDateType]}
            onUpdate={(val) => handleUpdateDisplayDateType(val[0])}
            options={[
              { value: 'cash', content: 'Cash' },
              { value: 'payment', content: 'Paid' },
              { value: 'issue', content: 'Issue' },
              { value: 'due', content: 'Due' },
              { value: 'received', content: 'Received' },
              { value: 'referto', content: 'Refer' },
              { value: 'entry', content: 'Entry' },
            ]}
            className="w-[100px]"
          />
        </div>
      ),
      template: (record) => formatDate(getTransactionDisplayDate(record))
    },
    {
      id: 'detail',
      name: 'Detail',
      width: '28%',
      template: (record) => (
        <>
          <span className="font-bold block">
            {record.to_account_id 
              ? (record.to_account_name || 'Transfer')
              : (record.payee_name || record.transactiontype_name || 'Transaction')}
          </span>
          {(record.category_name || record.subcategory_name) && (
            <span className="text-muted-foreground text-xs">
              {record.category_name}{record.subcategory_name ? `: ${record.subcategory_name}` : ''}
            </span>
          )}
        </>
      ),
    },
    {
      id: 'comment',
      name: 'Comments',
      width: '28%',
      template: (record) => (
        <div className="text-muted-foreground text-xs break-words max-w-[280px]">
          {record.comment || record.reference}
        </div>
      ),
    },
    {
      id: 'original',
      name: '',
      align: 'right',
      width: '8%',
      template: (record) => {
        const isMultiCurrency = record.original_currency_id && record.original_currency_id !== account.currency_id;
        if (isMultiCurrency && record.original_amount !== undefined && record.original_amount !== null) {
          const code = record.original_currency_code || '';
          const amt = Math.abs(record.original_amount);
          return <span className="text-muted-foreground text-sm">{`${code} ${amt.toFixed(2)}`}</span>;
        }
        return null;
      }
    },
    { id: 'out', name: 'Out', align: 'right', width: '7%', template: (record) => record.amount < 0 ? <span className="text-red-500">{formatCurrency(Math.abs(record.amount), '')}</span> : null },
    { id: 'in', name: 'In', align: 'right', width: '7%', template: (record) => record.amount > 0 ? <span className="text-green-500">{formatCurrency(record.amount, '')}</span> : null },
    {
      id: 'balance',
      name: 'Balance',
      align: 'right',
      width: '8%',
      template: (record) => {
        const bal = record.balance ?? 0;
        return (
          <span className={`font-bold ${bal >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(bal, '')}
          </span>
        );
      }
    },
  ];

  return (
    <div className="p-6">
      <div className="flex flex-col gap-6 w-full">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold m-0">{account.string_name || account.name}</h2>
            <div className="mt-2">
              <span className="font-bold text-2xl">Balance: </span>
              <span 
                className="text-3xl font-bold"
                style={{ color: account.balance >= 0 ? '#52c41a' : '#ff4d4f' }}
              >
                {formatCurrency(Math.abs(account.balance), account.currency_symbol)}
              </span>
              {latestTransactionDate && (
                <div className="mt-1">
                  <span className="font-bold text-sm">
                    {formatDateWithOrdinal(latestTransactionDate)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button view="normal" onClick={handleOpenImportModal}>
              <UploadIcon className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button view="action" onClick={handleAddTransaction}>
              <Plus className="mr-2 h-4 w-4" /> Add Transaction
            </Button>
          </div>
        </div>

        <div className="bg-muted/50 p-4 rounded-lg flex justify-between items-center">
            <div className="flex items-center gap-2">
                <span>Filter:</span>
                <Select
                  value={dateFilter ? [dateFilter] : ['all']}
                  onUpdate={(val) => setDateFilter(val[0] === 'all' ? null : val[0])}
                  options={dateFilterOptions}
                />
            </div>
            <Pagination
                page={currentPage}
                total={totalCount}
                pageSize={pageSize}
                onUpdate={(page, size) => { setCurrentPage(page); setPageSize(size); }}
                pageSizeOptions={[25, 50, 100, 200]}
            />
        </div>

        {loading ? (
          <div className="flex justify-center p-8"><Loader size="l" /></div>
        ) : (
          <Table
            columns={columns}
            data={transactions}
            getRowDescriptor={(item) => ({ id: String(item.transaction_id), interactive: true })}
            onRowClick={(item) => handleEditTransaction(item)}
            className="compact-table w-full"
          />
        )}
      </div>

      {account && (
        <TransactionModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          accountId={accountId}
          accountName={account.full_name || account.name}
          accountCurrency={account.currency_symbol}
          transaction={editingTransaction}
          onSave={handleSaveTransaction}
          onDelete={handleDeleteTransaction}
          isDryRun={false}
        />
      )}

      <Dialog open={isImportModalOpen} onClose={handleCloseImportModal}>
        <Dialog.Header caption="Import CSV Transactions" />
        <Dialog.Body>
          <div className="flex flex-col gap-4 pt-4">
            <Select
              width="max"
              placeholder="Select an import plan"
              value={selectedImportPlan ? [selectedImportPlan] : []}
              onUpdate={(val) => handleImportPlanChange(val[0])}
              options={importPlans.map(plan => ({ content: plan.name, value: plan.import_plan_id.toString() }))}
            />

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-semibold block mb-1 text-slate-600">Start Balance (Optional)</label>
                <TextInput
                  placeholder="e.g. 0.00 or -100.00"
                  value={startBalance}
                  onUpdate={(val) => setStartBalance(val)}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold block mb-1 text-slate-600">End Balance (Optional)</label>
                <TextInput
                  placeholder="e.g. 100.00 or -150.00"
                  value={endBalance}
                  onUpdate={(val) => setEndBalance(val)}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <input 
                type="file" 
                accept=".csv" 
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }} 
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                <UploadIcon className="mr-2 h-4 w-4" /> Select File
              </Button>
              {selectedFile && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">{selectedFile.name}</span>
                  <Button view="flat-danger" size="s" onClick={clearSelectedFile}>Clear</Button>
                </div>
              )}
            </div>

            {importResults && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                <p className="font-medium">Import Results</p>
                <p>Total rows: {importResults.total}</p>
                <p>Imported: {importResults.imported}</p>
                <p>Skipped: {importResults.skipped}</p>
                {importResults.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium">Errors:</p>
                    <ul className="list-disc list-inside">
                      {importResults.errors.slice(0, 5).map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          preset="default"
          textButtonCancel="Cancel"
          textButtonApply={importLoading ? 'Importing...' : 'Import'}
          onClickButtonCancel={handleCloseImportModal}
          onClickButtonApply={handleImportCSV}
          propsButtonApply={{ disabled: !selectedImportPlan || !selectedFile || importLoading, loading: importLoading }}
        />
      </Dialog>

      <Dialog open={isReconcileWarningOpen} onClose={() => setIsReconcileWarningOpen(false)}>
        <Dialog.Header caption="Balance Reconciliation Warning" />
        <Dialog.Body>
          <div className="flex flex-col gap-4 pt-4">
            <Alert
              view="filled"
              theme="warning"
              title="Statement Balance Mismatch"
              message="The sum of the imported transactions does not reconcile with the statement balances you entered."
            />
            <div className="text-sm border rounded-md p-3 bg-slate-50 flex flex-col gap-2">
              <div className="flex justify-between">
                <span>Entered Start Balance:</span>
                <span className="font-semibold">{reconcileWarningDetails?.start.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Sum of Imported Transactions:</span>
                <span className="font-semibold">{reconcileWarningDetails?.sum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>Calculated End Balance:</span>
                <span className="font-semibold">{reconcileWarningDetails?.expected.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Entered End Balance:</span>
                <span className="font-semibold">{reconcileWarningDetails?.end.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-red-600 font-bold">
                <span>Discrepancy:</span>
                <span>{reconcileWarningDetails?.diff.toFixed(2)}</span>
              </div>
            </div>
            
            {reconcileDuplicates.csvDuplicates.length > 0 && (
              <div className="flex flex-col gap-1 border rounded-md p-3 bg-amber-50/50">
                <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Same-day identical transactions in CSV:</span>
                <div className="max-h-32 overflow-y-auto flex flex-col gap-1 text-xs text-slate-700 mt-1">
                  {reconcileDuplicates.csvDuplicates.map((item, idx) => (
                    <div key={idx} className="flex justify-between border-b pb-1 last:border-0">
                      <span>{item.cash} - {item.comment || item.payee_desc || 'Unknown Payee'}</span>
                      <span className="font-semibold">{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reconcileDuplicates.dbMatches.length > 0 && (
              <div className="flex flex-col gap-1 border rounded-md p-3 bg-red-50/50">
                <span className="text-xs font-semibold text-red-800 uppercase tracking-wider">Potential duplicate matches in Database:</span>
                <div className="max-h-32 overflow-y-auto flex flex-col gap-1 text-xs text-slate-700 mt-1">
                  {reconcileDuplicates.dbMatches.map((match, idx) => (
                    <div key={idx} className="flex justify-between border-b pb-1 last:border-0">
                      <span>{match.payload.cash} - {match.payload.comment || match.dbTransaction.payee_name || 'Unknown'}</span>
                      <span>
                        Importing: <span className="font-semibold text-red-700">{match.payload.amount.toFixed(2)}</span> (DB: {match.dbTransaction.amount.toFixed(2)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              This discrepancy could be caused by omitted duplicate same-day transactions in the CSV file, missing statement entries, or timezone issues. Please check your bank statement.
            </p>
          </div>
        </Dialog.Body>
        <Dialog.Footer
          preset="default"
          textButtonCancel="Cancel Import"
          textButtonApply="Proceed Anyway"
          onClickButtonCancel={() => setIsReconcileWarningOpen(false)}
          onClickButtonApply={handleConfirmImportWithDiscrepancy}
        />
      </Dialog>
      
      {account && isImportWizardModalOpen && importWizardItems[currentWizardIndex] && (
        <TransactionModal
          isOpen={isImportWizardModalOpen}
          onClose={handleWizardCancel}
          accountId={accountId}
          accountName={`${account.full_name || account.name} (Import Row ${currentWizardIndex + 1} of ${importWizardItems.filter(item => !item.isIgnored).length})`}
          accountCurrency={account.currency_symbol}
          transaction={{
            date: importWizardItems[currentWizardIndex].date,
            cash: importWizardItems[currentWizardIndex].date,
            payment: importWizardItems[currentWizardIndex].payment_date,
            to_account_cash: importWizardItems[currentWizardIndex].date,
            to_account_payment: importWizardItems[currentWizardIndex].payment_date,
            amount: importWizardItems[currentWizardIndex].amount,
            comments: importWizardItems[currentWizardIndex].comments,
            reference: importWizardItems[currentWizardIndex].reference,
            payee_desc: importWizardItems[currentWizardIndex].payee_desc,
            payee_id: importWizardItems[currentWizardIndex].payee_id,
            category_id: importWizardItems[currentWizardIndex].category_id,
            to_account_id: importWizardItems[currentWizardIndex].to_account_id,
            original_currency_id: importWizardItems[currentWizardIndex].original_currency_id,
            original_amount: importWizardItems[currentWizardIndex].original_amount
          }}
          onSave={handleWizardSave}
          onDelete={() => {}}
          isDryRun={false}
          isImportMode={true}
          onIgnore={handleWizardIgnore}
          onCancelImport={handleWizardCancel}
        />
      )}

      <Dialog open={isAlertOpen} onClose={() => setIsAlertOpen(false)}>
        <Dialog.Header caption="Alert" />
        <Dialog.Body>
          <div className="pt-4 flex flex-col gap-4">
            <span className="text-sm">{alertMessage}</span>
            <div className="flex justify-end pt-2">
              <Button view="action" onClick={() => setIsAlertOpen(false)}>
                OK
              </Button>
            </div>
          </div>
        </Dialog.Body>
      </Dialog>

    </div>
  );
}
