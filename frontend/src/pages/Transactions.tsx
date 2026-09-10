import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Dialog, Select, Pagination, Loader, Alert, TableColumnConfig, TextInput, Checkbox } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Upload as UploadIcon } from 'lucide-react';

import { TransactionModal } from '../components/Transaction/TransactionModal';
import api from '../services/api';
import { showWarning, showError, showSuccess } from '../utils/notifications';
import { formatAmount as formatAmountShared, formatDate as formatDateShared } from '../utils/format';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';

const quickDateOptions = [
  { value: 'all', content: 'All Dates' },
  { value: 'today', content: 'Today' },
  { value: 'last7', content: 'Last 7 Days' },
  { value: 'last30', content: 'Last 30 Days' },
  { value: 'this_month', content: 'This Month' },
  { value: 'this_year', content: 'This Year' },
];

// Fills the granular From/To date fields from a quick pick; From/To stay
// freely editable afterward for exact-date filtering.
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const quickDateRange = (key: string): { from: string; to: string } => {
  const today = new Date();
  const to = isoDate(today);
  switch (key) {
    case 'today':
      return { from: to, to };
    case 'last7': {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { from: isoDate(d), to };
    }
    case 'last30': {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { from: isoDate(d), to };
    }
    case 'this_month':
      return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    case 'this_year':
      return { from: isoDate(new Date(today.getFullYear(), 0, 1)), to };
    default:
      return { from: '', to: '' };
  }
};

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
  const { defaultLocale } = useDisplaySettings();
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
  const [quickDate, setQuickDate] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [commentFilter, setCommentFilter] = useState('');
  const [payeeFilter, setPayeeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [displayDateType, setDisplayDateType] = useState<string>(() => {
    if (accountId) {
      return getCookie(`display_date_type_account_${accountId}`) || 'cash';
    }
    return 'cash';
  });
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPlans, setImportPlans] = useState<ImportPlan[]>([]);
  const [selectedImportPlan, setSelectedImportPlan] = useState<string | undefined>(undefined);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  // Import Wizard State
  const [importWizardItems, setImportWizardItems] = useState<any[]>([]);
  const [currentWizardIndex, setCurrentWizardIndex] = useState<number>(-1);
  const [isImportWizardModalOpen, setIsImportWizardModalOpen] = useState<boolean>(false);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [allPayees, setAllPayees] = useState<any[]>([]);
  const [allCurrencies, setAllCurrencies] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk import review grid state
  const [isReviewGridOpen, setIsReviewGridOpen] = useState<boolean>(false);
  const [reviewRows, setReviewRows] = useState<any[]>([]);
  const [reviewPlanId, setReviewPlanId] = useState<number | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Multi-select + bulk edit (payee/category) for the transaction list.
  // Selection is scoped to the current page/filter view — it's cleared
  // whenever the list is refetched (page, filters, or after applying).
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSetPayee, setBulkSetPayee] = useState(false);
  const [bulkPayeeId, setBulkPayeeId] = useState<string>('');
  const [bulkSetCategory, setBulkSetCategory] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>('');
  const [bulkApplying, setBulkApplying] = useState(false);

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

      if (fromDate) params.append('start_date', fromDate);
      if (toDate) params.append('end_date', toDate);
      if (minAmount) params.append('min_amount', minAmount);
      if (maxAmount) params.append('max_amount', maxAmount);
      if (commentFilter) params.append('comment', commentFilter);
      if (payeeFilter !== 'all') params.append('payee_id', payeeFilter);
      if (categoryFilter !== 'all') params.append('category_id', categoryFilter);

      const transactionsResponse = await api.get(`/accounts/${accountId}/transactions/`, { params });
      setTransactions(transactionsResponse.data.results || []);
      setTotalCount(transactionsResponse.data.count || 0);
      setSelectedIds(new Set());

    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to fetch data');
      setAccount(null);
      setTransactions([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [accountId, currentPage, pageSize, fromDate, toDate, minAmount, maxAmount, commentFilter, payeeFilter, categoryFilter]);

  // Debounce the comment search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setCommentFilter(commentInput.trim()), 400);
    return () => clearTimeout(t);
  }, [commentInput]);

  // Any filter change invalidates the current page — jump back to page 1
  // rather than showing an empty page 4 of a now much-smaller result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, minAmount, maxAmount, commentFilter, payeeFilter, categoryFilter]);

  const loadLookupData = async () => {
    try {
      const response = await api.get('/transactions/lookup-data/');
      setAllCategories(response.data?.categories || []);
      setAllAccounts(response.data?.accounts || []);
      setAllPayees(response.data?.payees || []);
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
    return formatDateShared(date, defaultLocale);
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
    return formatAmountShared(amount, symbol, defaultLocale);
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
    setSelectedFiles([]);
    setSelectedImportPlan(undefined);
    setStartBalance('');
    setEndBalance('');
    setIsImportModalOpen(true);
    try {
      const statusResp = await api.get('/transactions/ai-categorization/status/');
      setAiEnabled(!!statusResp.data?.enabled);
    } catch {
      setAiEnabled(false);
    }
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
    const picked = Array.from(event.target.files || []);
    if (picked.length === 0) return;
    setSelectedFiles(prev => {
      // Append and de-dupe by name+size so re-opening the picker doesn't drop earlier selections.
      const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}`));
      const toAdd = picked.filter(f => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...toAdd];
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
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
      setIsReviewGridOpen(false);
      setReviewRows([]);
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
        setIsReviewGridOpen(false);
        setReviewRows([]);
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

  // ---- Bulk import review grid ----

  // Match key: date + amount + normalized description. Requiring the
  // description too (not just date+amount) avoids false positives like two
  // unrelated same-amount purchases on the same day, while still reliably
  // catching the real case: re-importing the same or an overlapping
  // statement, where the bank's description text is byte-identical.
  const dedupKey = (date: string, amount: number, comment: string) =>
    `${date}|${Math.round(amount * 100)}|${(comment || '').trim().toLowerCase()}`;

  // Flags rows that look like duplicates — either of another row in this
  // same import batch (e.g. overlapping file date ranges) or of a
  // transaction already saved in this account. Duplicates default to
  // unchecked (excluded) so nothing gets silently double-imported; the user
  // can still re-include a flagged row if it's a false positive.
  const flagDuplicateRows = async (rows: any[]): Promise<any[]> => {
    const dates = rows.map(r => r.date).filter(Boolean);
    let existingKeys = new Set<string>();
    if (dates.length > 0 && accountId) {
      dates.sort();
      try {
        const response = await api.get(`/accounts/${accountId}/transactions/`, {
          params: { start_date: dates[0], end_date: dates[dates.length - 1], page_size: 5000 },
        });
        const dbTxs = response.data.results || [];
        existingKeys = new Set(
          dbTxs.map((t: any) => dedupKey(t.cash, t.amount, t.comment || ''))
        );
      } catch (err) {
        console.error('Error fetching existing transactions for duplicate detection:', err);
      }
    }

    const seenInBatch = new Set<string>();
    return rows.map(row => {
      const key = dedupKey(row.date, row.amount, row.comments);
      let isDuplicate = false;
      let duplicateReason = '';
      if (existingKeys.has(key)) {
        isDuplicate = true;
        duplicateReason = 'Already imported — matches an existing transaction in this account';
      } else if (seenInBatch.has(key)) {
        isDuplicate = true;
        duplicateReason = 'Duplicate of another row in this import (same date, amount & description)';
      }
      seenInBatch.add(key);
      return { ...row, isDuplicate, duplicateReason, include: !isDuplicate };
    });
  };

  const categoryFullName = (categoryId: number | null): string => {
    if (!categoryId) return '';
    const cat = allCategories.find(c => c.category_id === categoryId);
    if (!cat) return '';
    if (cat.parent_category_id) {
      const parent = allCategories.find(c => c.category_id === cat.parent_category_id);
      return parent ? `${parent.name}: ${cat.name}` : cat.name;
    }
    return cat.name;
  };

  const categoryOptions = React.useMemo(
    () =>
      [...allCategories]
        .map(c => ({ value: String(c.category_id), content: categoryFullName(c.category_id) }))
        .sort((a, b) => a.content.localeCompare(b.content)),
    [allCategories]
  );

  // Filter dropdowns only offer canonical (non-alias) payees/categories —
  // matching them still catches transactions still tagged with an old alias
  // id, since the backend resolves aliases server-side (see
  // app/payee_utils.py / app/category_utils.py).
  const filterCategoryOptions = React.useMemo(
    () => [
      { value: 'all', content: 'All Categories' },
      ...[...allCategories]
        .filter(c => !c.merged_into_category_id)
        .map(c => ({ value: String(c.category_id), content: categoryFullName(c.category_id) }))
        .sort((a, b) => a.content.localeCompare(b.content)),
    ],
    [allCategories]
  );

  const filterPayeeOptions = React.useMemo(
    () => [
      { value: 'all', content: 'All Payees' },
      ...[...allPayees]
        .filter(p => !p.merged_into_payee_id)
        .map(p => ({ value: String(p.payee_id), content: p.name }))
        .sort((a, b) => a.content.localeCompare(b.content)),
    ],
    [allPayees]
  );

  const hasActiveFilters = fromDate || toDate || minAmount || maxAmount || commentInput || payeeFilter !== 'all' || categoryFilter !== 'all';

  const clearFilters = () => {
    setQuickDate('all');
    setFromDate('');
    setToDate('');
    setMinAmount('');
    setMaxAmount('');
    setCommentInput('');
    setCommentFilter('');
    setPayeeFilter('all');
    setCategoryFilter('all');
  };

  const updateReviewRow = (index: number, patch: any) => {
    setReviewRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  // Copy a row's category/payee to every other row with the same description.
  const applyRowToSimilar = (index: number) => {
    setReviewRows(prev => {
      const src = prev[index];
      const key = (src.comments || '').trim().toLowerCase();
      if (!key) return prev;
      return prev.map(r =>
        (r.comments || '').trim().toLowerCase() === key
          ? {
              ...r,
              category_id: src.category_id,
              newCategoryName: src.newCategoryName,
              newCategoryParent: src.newCategoryParent,
              payee_id: src.payee_id,
              newPayeeName: src.newPayeeName,
            }
          : r
      );
    });
  };

  const handleAiAutofill = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const payload = {
        transactions: reviewRows.map((r, i) => ({
          index: i,
          description: r.comments || '',
          amount: r.amount,
        })),
      };
      const resp = await api.post('/transactions/suggest-categorization/', payload);
      const suggestions: any[] = resp.data?.suggestions || [];

      setReviewRows(prev => {
        const next = [...prev];
        for (const s of suggestions) {
          const row = next[s.index];
          if (!row) continue;
          const updated = { ...row, aiConfidence: s.confidence ?? null };
          // Don't overwrite values the user (or a rule) already set.
          if (!updated.category_id && !updated.newCategoryName) {
            if (s.category_id) {
              updated.category_id = s.category_id;
            } else if (s.category) {
              updated.newCategoryName = s.category;
              updated.newCategoryParent = s.parent || null;
            }
          }
          if (!updated.payee_id && !updated.newPayeeName && s.payee) {
            const existing = allPayees.find(
              p => p.name.trim().toLowerCase() === String(s.payee).trim().toLowerCase()
            );
            if (existing) {
              updated.payee_id = existing.payee_id;
            } else {
              updated.newPayeeName = s.payee;
            }
          }
          next[s.index] = updated;
        }
        return next;
      });
      showSuccess('AI suggestions applied', 'Review the filled categories and payees before importing.');
    } catch (error: any) {
      const detail = error?.response?.data?.detail || (error instanceof Error ? error.message : 'Unknown error');
      showError('AI auto-fill failed', detail);
    } finally {
      setAiLoading(false);
    }
  };

  const resolvePayeeId = async (row: any, createdCache: { [name: string]: number }): Promise<number | null> => {
    if (row.payee_id) return row.payee_id;
    const name = (row.newPayeeName || '').trim();
    if (!name) return null;
    const key = name.toLowerCase();
    if (createdCache[key]) return createdCache[key];
    const existing = allPayees.find(p => p.name.trim().toLowerCase() === key);
    if (existing) {
      createdCache[key] = existing.payee_id;
      return existing.payee_id;
    }
    const resp = await api.post('/accounts/payees/', { name });
    const newId = resp.data?.payee_id;
    createdCache[key] = newId;
    return newId;
  };

  // Find or create a category by name (optionally under a parent), caching within a batch.
  const resolveCategoryByName = async (
    name: string,
    parentId: number | null,
    cache: { [key: string]: number }
  ): Promise<number | null> => {
    const clean = (name || '').trim();
    if (!clean) return null;
    const key = `${parentId || ''}|${clean.toLowerCase()}`;
    if (cache[key]) return cache[key];
    const existing = allCategories.find(
      c =>
        c.name.trim().toLowerCase() === clean.toLowerCase() &&
        (c.parent_category_id || null) === (parentId || null)
    );
    if (existing) {
      cache[key] = existing.category_id;
      return existing.category_id;
    }
    const resp = await api.post('/accounts/categories/', {
      name: clean,
      parent_category_id: parentId,
      is_hidden: false,
    });
    const newId = resp.data?.category_id;
    cache[key] = newId;
    return newId;
  };

  const resolveCategoryId = async (
    row: any,
    cache: { [key: string]: number }
  ): Promise<number | null> => {
    if (row.category_id) return row.category_id;
    if (!row.newCategoryName) return null;
    let parentId: number | null = null;
    if (row.newCategoryParent) {
      parentId = await resolveCategoryByName(row.newCategoryParent, null, cache);
    }
    return resolveCategoryByName(row.newCategoryName, parentId, cache);
  };

  const handleReviewImport = async () => {
    if (importLoading) return;
    const rowsToImport = reviewRows.filter(r => r.include);
    if (rowsToImport.length === 0) {
      showWarning('Nothing selected', 'Select at least one row to import.');
      return;
    }
    setImportLoading(true);
    try {
      const createdPayees: { [name: string]: number } = {};
      const createdCats: { [key: string]: number } = {};

      // 1. Create any new payees/categories and build transaction payloads.
      const items: any[] = [];
      for (const row of rowsToImport) {
        const payeeId = await resolvePayeeId(row, createdPayees);
        const categoryId = await resolveCategoryId(row, createdCats);
        const resolved: any = {
          accountId: parseInt(accountId || '0'),
          cash: row.date,
          payment: row.payment_date || null,
          amount: row.amount,
          comment: row.comments || '',
          reference: row.reference || '',
          payee_id: payeeId || null,
          category_id: categoryId || null,
          toAccountId: row.to_account_id || null,
          transactionType: row.to_account_id ? 'transfer' : (row.amount > 0 ? 'deposit' : 'withdrawal'),
        };
        if (row.to_account_id) {
          resolved.toAccountCash = row.date;
          resolved.toAccountPayment = row.payment_date || null;
        }
        items.push({ isIgnored: false, resolvedData: resolved });
        row._resolvedPayeeId = payeeId || null;
        row._resolvedCategoryId = categoryId || null;
      }

      // 2. Learn rules from rows the user asked to remember.
      await createRulesFromRows(rowsToImport);

      // 3. Reuse the existing commit path (balance reconciliation + dedup + save).
      await commitImportBatch(items);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || (error instanceof Error ? error.message : 'Unknown error');
      showError('Import failed', detail);
      setImportLoading(false);
    }
  };

  const createRulesFromRows = async (rows: any[]) => {
    if (!reviewPlanId || !csvTemplate) return;
    // Rules match on the description column; find its template field id.
    const descField = csvTemplate.fields.find(
      (f: any) => (f.map_field || f.map) === 'COMMENTS'
    ) || csvTemplate.fields.find(
      (f: any) => (f.name || '').toLowerCase().startsWith('descri')
    );
    if (!descField) return;

    const seenPatterns = new Set<string>();
    const rulePayloads: any[] = [];
    for (const row of rows) {
      if (!row.rememberRule) continue;
      const pattern = (row.comments || '').trim();
      if (!pattern) continue;
      const key = pattern.toLowerCase();
      if (seenPatterns.has(key)) continue;
      seenPatterns.add(key);
      const payeeId = row._resolvedPayeeId ?? row.payee_id ?? null;
      const categoryId = row._resolvedCategoryId ?? row.category_id ?? null;
      if (!payeeId && !categoryId) continue; // nothing to remember
      rulePayloads.push({
        import_plan_id: reviewPlanId,
        import_csv_field_id: descField.import_csv_field_id,
        pattern,
        order: 0,
        ignore: false,
        match_type: 'contains',
        payee_id: payeeId,
        category_id: categoryId,
      });
    }
    if (rulePayloads.length > 0) {
      try {
        await api.post('/accounts/import-plan-rules/bulk/', rulePayloads);
      } catch (error) {
        console.error('Failed to save import rules:', error);
        // Non-fatal — the import itself still succeeds.
      }
    }
  };

  const handleReviewCancel = () => {
    setIsReviewGridOpen(false);
    setReviewRows([]);
    showWarning('Import Cancelled', 'No transactions were saved.');
  };

  // Parses one file into a plain { headers, rows } table. Non-CSV statements
  // (Santander .xls / PDF) are normalized server-side into the same shape a
  // plain CSV produces; .csv still parses client-side.
  const parseFileToRows = async (file: File): Promise<{ headers: string[]; dataRows: string[][] }> => {
    const fileName = file.name.toLowerCase();
    const isBinaryStatement = /\.(xls|xlsx|pdf)$/.test(fileName);

    if (isBinaryStatement) {
      const formData = new FormData();
      formData.append('file', file);
      const parseResponse = await api.post('/accounts/parse-statement/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const headers = parseResponse.data.headers || [];
      const dataRows = parseResponse.data.rows || [];
      if (headers.length === 0 || dataRows.length === 0) {
        throw new Error('No transactions were found in the statement file');
      }
      return { headers, dataRows };
    }

    const csvData = await parseCsvFile(file);
    if (csvData.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }
    return { headers: csvData[0], dataRows: csvData.slice(1) };
  };

  const handleImportCSV = async () => {
    if (importLoading) return;
    if (!selectedImportPlan || selectedFiles.length === 0 || !csvTemplate) {
      showWarning('Missing Information', 'Please select an import plan and at least one file');
      return;
    }

    setImportLoading(true);
    setImportResults(null);

    try {
      const selectedPlan = importPlans.find(p => p.import_plan_id.toString() === selectedImportPlan);
      if (!selectedPlan) {
        throw new Error('Selected import plan not found');
      }

      // Parse every selected file independently (each keeps its own headers,
      // since header casing/order can differ file to file), then merge all
      // rows into one combined batch before sorting/rule-matching/dedup.
      const failedFiles: string[] = [];
      const parsedItems: { csvRow: string[]; transaction: TransactionImport; headers: string[] }[] = [];

      for (const file of selectedFiles) {
        try {
          const { headers, dataRows } = await parseFileToRows(file);
          for (const csvRow of dataRows) {
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

            parsedItems.push({ csvRow, transaction, headers });
          }
        } catch (fileError) {
          console.error(`Error parsing file ${file.name}:`, fileError);
          failedFiles.push(file.name);
        }
      }

      if (parsedItems.length === 0) {
        throw new Error(
          failedFiles.length > 0
            ? `Could not parse any of the selected files: ${failedFiles.join(', ')}`
            : 'No transactions were found in the selected files'
        );
      }

      // Sort chronological: oldest to newest (across all files combined)
      const parseDateSafe = (dStr: string) => {
        const t = Date.parse(dStr);
        return isNaN(t) ? 0 : t;
      };
      parsedItems.sort((a, b) => parseDateSafe(a.transaction.date) - parseDateSafe(b.transaction.date));

      const wizardItems: any[] = [];

      for (const item of parsedItems) {
        let tx = item.transaction;
        if (!tx.date || tx.amount === 0) continue;

        const { matchedRule, isIgnored } = applyImportRules(tx, item.csvRow, item.headers, selectedPlan.rules);
        
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

      // Build the bulk review grid from every non-ignored row. Rules that
      // matched already pre-filled payee_id/category_id; the rest start blank
      // and can be filled by hand, by "apply to similar", or by AI.
      const gridRows = wizardItems
        .filter(item => !item.isIgnored)
        .map(item => ({
          date: item.date,
          payment_date: item.payment_date,
          amount: item.amount,
          comments: item.comments || '',
          reference: item.reference || '',
          payee_desc: item.payee_desc || '',
          csvRow: item.csvRow,
          category_id: item.category_id ?? null,
          payee_id: item.payee_id ?? null,
          to_account_id: item.to_account_id ?? null,
          newPayeeName: null as string | null,
          newCategoryName: null as string | null,
          newCategoryParent: null as string | null,
          rememberRule: false,
          aiConfidence: null as number | null,
          include: true,
        }));

      if (gridRows.length === 0) {
        showWarning('Nothing to import', 'All rows were ignored by the import plan rules.');
        return;
      }

      // Flag rows that duplicate an existing transaction or another row in
      // this same batch (e.g. overlapping file date ranges); those default
      // to unchecked so nothing gets imported twice without explicit review.
      const flaggedRows = await flagDuplicateRows(gridRows);
      const duplicateCount = flaggedRows.filter(r => r.isDuplicate).length;

      setReviewRows(flaggedRows);
      setReviewPlanId(selectedPlan.import_plan_id);
      setIsImportModalOpen(false);
      setIsReviewGridOpen(true);

      if (failedFiles.length > 0) {
        showWarning(
          'Some files could not be parsed',
          `Skipped: ${failedFiles.join(', ')}. Continuing with the rest.`
        );
      } else if (duplicateCount > 0) {
        showWarning(
          'Possible duplicates found',
          `${duplicateCount} row${duplicateCount > 1 ? 's' : ''} matched an existing or repeated transaction and ${duplicateCount > 1 ? 'were' : 'was'} unchecked. Review before importing.`
        );
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

  const toggleSelectRow = (id: number, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = (checked: boolean) => {
    setSelectedIds(checked ? new Set(transactions.map(t => t.transaction_id)) : new Set());
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkSetPayee(false);
    setBulkPayeeId('');
    setBulkSetCategory(false);
    setBulkCategoryId('');
  };

  const applyBulkEdit = async () => {
    if (!bulkSetPayee && !bulkSetCategory) {
      showError('Pick a payee and/or category to apply');
      return;
    }
    if (bulkSetCategory && !bulkCategoryId) {
      showError('Select a category to apply');
      return;
    }

    setBulkApplying(true);
    try {
      const payload: any = { transaction_ids: Array.from(selectedIds) };
      if (bulkSetPayee) {
        payload.set_payee = true;
        payload.payee_id = bulkPayeeId ? parseInt(bulkPayeeId, 10) : null;
      }
      if (bulkSetCategory) {
        payload.set_category = true;
        payload.category_id = parseInt(bulkCategoryId, 10);
      }
      const response = await api.post('/transactions/bulk-update/', payload);
      const { updated, skipped } = response.data;
      showSuccess(`Updated ${updated} transaction${updated === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped — locked)` : ''}`);
      clearSelection();
      await fetchAccountAndTransactions();
    } catch (error: any) {
      showError('Failed to apply bulk edit', error?.response?.data?.detail || (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setBulkApplying(false);
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

  const allSelectedOnPage = transactions.length > 0 && transactions.every(t => selectedIds.has(t.transaction_id));
  const someSelectedOnPage = transactions.some(t => selectedIds.has(t.transaction_id));

  const columns: TableColumnConfig<Transaction>[] = [
    {
      id: 'select',
      width: '3%',
      name: () => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={allSelectedOnPage}
            indeterminate={someSelectedOnPage && !allSelectedOnPage}
            onUpdate={(checked) => toggleSelectAllOnPage(checked)}
          />
        </div>
      ),
      template: (record) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectedIds.has(record.transaction_id)}
            onUpdate={(checked) => toggleSelectRow(record.transaction_id, checked)}
          />
        </div>
      ),
    },
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
      align: 'end',
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
    { id: 'out', name: 'Out', align: 'end', width: '7%', template: (record) => record.amount < 0 ? <span className="text-red-500">{formatCurrency(Math.abs(record.amount), '')}</span> : null },
    { id: 'in', name: 'In', align: 'end', width: '7%', template: (record) => record.amount > 0 ? <span className="text-green-500">{formatCurrency(record.amount, '')}</span> : null },
    {
      id: 'balance',
      name: 'Balance',
      align: 'end',
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

        <div className="bg-muted/50 p-4 rounded-lg flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1 text-muted-foreground">Comment</label>
                <TextInput
                  placeholder="Search comment…"
                  value={commentInput}
                  onUpdate={setCommentInput}
                  size="m"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1 text-muted-foreground">Payee</label>
                <Select
                  value={[payeeFilter]}
                  onUpdate={(val) => setPayeeFilter(val[0] || 'all')}
                  options={filterPayeeOptions}
                  filterable
                  width={180}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1 text-muted-foreground">Category</label>
                <Select
                  value={[categoryFilter]}
                  onUpdate={(val) => setCategoryFilter(val[0] || 'all')}
                  options={filterCategoryOptions}
                  filterable
                  width={200}
                />
              </div>
              <div className="flex gap-1 items-end">
                <div>
                  <label className="text-xs font-semibold block mb-1 text-muted-foreground">Min Value</label>
                  <TextInput
                    placeholder="0.00"
                    value={minAmount}
                    onUpdate={setMinAmount}
                    size="m"
                    style={{ width: 90 }}
                  />
                </div>
                <span className="pb-2 text-muted-foreground">–</span>
                <div>
                  <label className="text-xs font-semibold block mb-1 text-muted-foreground">Max Value</label>
                  <TextInput
                    placeholder="0.00"
                    value={maxAmount}
                    onUpdate={setMaxAmount}
                    size="m"
                    style={{ width: 90 }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1 text-muted-foreground">Quick Range</label>
                <Select
                  value={[quickDate]}
                  onUpdate={(val) => {
                    const key = val[0] || 'all';
                    setQuickDate(key);
                    const { from, to } = quickDateRange(key);
                    setFromDate(from);
                    setToDate(to);
                  }}
                  options={quickDateOptions}
                  width={140}
                />
              </div>
              <div className="flex gap-1 items-end">
                <div>
                  <label className="text-xs font-semibold block mb-1 text-muted-foreground">From</label>
                  <input
                    type="date"
                    className="border rounded p-1.5 text-sm bg-background text-foreground"
                    value={fromDate}
                    onChange={(e) => { setFromDate(e.target.value); setQuickDate('all'); }}
                  />
                </div>
                <span className="pb-2 text-muted-foreground">–</span>
                <div>
                  <label className="text-xs font-semibold block mb-1 text-muted-foreground">To</label>
                  <input
                    type="date"
                    className="border rounded p-1.5 text-sm bg-background text-foreground"
                    value={toDate}
                    onChange={(e) => { setToDate(e.target.value); setQuickDate('all'); }}
                  />
                </div>
              </div>
              {hasActiveFilters && (
                <Button view="flat" onClick={clearFilters}>Clear Filters</Button>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{totalCount} transaction{totalCount === 1 ? '' : 's'}</span>
              <Pagination
                  page={currentPage}
                  total={totalCount}
                  pageSize={pageSize}
                  onUpdate={(page, size) => { setCurrentPage(page); setPageSize(size); }}
                  pageSizeOptions={[25, 50, 100, 200]}
              />
            </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 p-4 rounded-lg flex flex-wrap items-end gap-3">
            <span className="text-sm font-semibold pb-2">{selectedIds.size} selected</span>
            <div className="flex items-end gap-2">
              <Checkbox checked={bulkSetPayee} onUpdate={setBulkSetPayee}>Set Payee</Checkbox>
              <Select
                disabled={!bulkSetPayee}
                placeholder="Clear payee"
                value={bulkPayeeId ? [bulkPayeeId] : []}
                onUpdate={(val) => setBulkPayeeId(val[0] || '')}
                options={filterPayeeOptions.slice(1)}
                filterable
                hasClear
                width={180}
              />
            </div>
            <div className="flex items-end gap-2">
              <Checkbox checked={bulkSetCategory} onUpdate={setBulkSetCategory}>Set Category</Checkbox>
              <Select
                disabled={!bulkSetCategory}
                placeholder="Select category"
                value={bulkCategoryId ? [bulkCategoryId] : []}
                onUpdate={(val) => setBulkCategoryId(val[0] || '')}
                options={filterCategoryOptions.slice(1)}
                filterable
                width={200}
              />
            </div>
            <Button view="action" loading={bulkApplying} disabled={bulkApplying} onClick={applyBulkEdit}>
              Apply to {selectedIds.size}
            </Button>
            <Button view="flat" onClick={clearSelection}>Clear Selection</Button>
          </div>
        )}

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
            
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept=".csv,.xls,.xlsx,.pdf"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <div className="flex items-center gap-2">
                <Button onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon className="mr-2 h-4 w-4" /> Select Files
                </Button>
                {selectedFiles.length > 0 && (
                  <>
                    <span className="text-sm">{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected</span>
                    <Button view="flat-danger" size="s" onClick={clearSelectedFiles}>Clear All</Button>
                  </>
                )}
              </div>
              {selectedFiles.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {selectedFiles.map((file, i) => (
                    <li key={`${file.name}_${file.size}_${i}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{file.name}</span>
                      <Button view="flat-danger" size="s" onClick={() => removeSelectedFile(i)}>Remove</Button>
                    </li>
                  ))}
                </ul>
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
          propsButtonApply={{ disabled: !selectedImportPlan || selectedFiles.length === 0 || importLoading, loading: importLoading }}
        />
      </Dialog>

      <Dialog open={isReviewGridOpen} onClose={handleReviewCancel}>
        <Dialog.Header caption="Review & Import Transactions" />
        <Dialog.Body>
          <div style={{ width: 'min(1100px, 88vw)' }}>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <span className="text-sm">
                {reviewRows.filter(r => r.include).length} of {reviewRows.length} selected ·{' '}
                {reviewRows.filter(r => r.include && !r.category_id).length} uncategorized
                {reviewRows.some(r => r.isDuplicate) && (
                  <> · <span className="text-amber-600">{reviewRows.filter(r => r.isDuplicate).length} possible duplicate{reviewRows.filter(r => r.isDuplicate).length > 1 ? 's' : ''} unchecked</span></>
                )}
              </span>
              <div className="flex items-center gap-2">
                {aiEnabled && (
                  <Button view="outlined-action" onClick={handleAiAutofill} loading={aiLoading} disabled={aiLoading}>
                    ✨ Auto-fill with AI
                  </Button>
                )}
              </div>
            </div>
            <div style={{ maxHeight: '58vh', overflow: 'auto', border: '1px solid var(--g-color-line-generic)', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--g-color-base-background)', zIndex: 1 }}>
                  <tr className="text-left">
                    <th style={{ padding: '6px 8px', width: 32 }}></th>
                    <th style={{ padding: '6px 8px', width: 90 }}>Date</th>
                    <th style={{ padding: '6px 8px' }}>Description</th>
                    <th style={{ padding: '6px 8px', width: 100, textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '6px 8px', width: 230 }}>Category</th>
                    <th style={{ padding: '6px 8px', width: 230 }}>Payee</th>
                    <th style={{ padding: '6px 8px', width: 70, textAlign: 'center' }} title="Save a rule so future imports auto-fill this description">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.map((row, i) => {
                    const payeeOptions = allPayees.map(p => ({ value: String(p.payee_id), content: p.name }));
                    let payeeValue: string[] = [];
                    if (row.payee_id) {
                      payeeValue = [String(row.payee_id)];
                    } else if (row.newPayeeName) {
                      payeeOptions.unshift({ value: `new:${row.newPayeeName}`, content: `➕ ${row.newPayeeName} (new)` });
                      payeeValue = [`new:${row.newPayeeName}`];
                    }
                    const catOpts = [...categoryOptions];
                    let catValue: string[] = [];
                    if (row.category_id) {
                      catValue = [String(row.category_id)];
                    } else if (row.newCategoryName) {
                      const label = row.newCategoryParent ? `${row.newCategoryParent}: ${row.newCategoryName}` : row.newCategoryName;
                      catOpts.unshift({ value: `newcat:${label}`, content: `➕ ${label} (new)` });
                      catValue = [`newcat:${label}`];
                    }
                    const promptNewCategory = () => {
                      const input = window.prompt("New category — use 'Parent: Child' for a subcategory:");
                      if (!input || !input.trim()) return;
                      const t = input.trim();
                      if (t.includes(':')) {
                        const idx = t.indexOf(':');
                        updateReviewRow(i, { category_id: null, newCategoryParent: t.slice(0, idx).trim(), newCategoryName: t.slice(idx + 1).trim() });
                      } else {
                        updateReviewRow(i, { category_id: null, newCategoryParent: null, newCategoryName: t });
                      }
                    };
                    const promptNewPayee = () => {
                      const input = window.prompt('New payee name:');
                      if (!input || !input.trim()) return;
                      updateReviewRow(i, { payee_id: null, newPayeeName: input.trim() });
                    };
                    return (
                      <tr
                        key={i}
                        style={{
                          borderTop: '1px solid var(--g-color-line-generic)',
                          opacity: row.include ? 1 : 0.45,
                          background: row.isDuplicate ? 'rgba(217, 119, 6, 0.08)' : undefined,
                        }}
                      >
                        <td style={{ padding: '4px 8px' }}>
                          <Checkbox checked={row.include} onUpdate={(checked) => updateReviewRow(i, { include: checked })} />
                        </td>
                        <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{formatDate(row.date)}</td>
                        <td style={{ padding: '4px 8px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.duplicateReason || row.comments}>
                          {row.isDuplicate && (
                            <span className="text-amber-600 font-semibold" style={{ marginRight: 6 }} title={row.duplicateReason}>⚠ Duplicate</span>
                          )}
                          {row.comments}
                          {row.aiConfidence != null && (
                            <span className="text-xs" style={{ opacity: 0.5, marginLeft: 6 }}>({Math.round(row.aiConfidence * 100)}%)</span>
                          )}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span className={row.amount < 0 ? 'text-red-500' : 'text-green-500'}>{row.amount.toFixed(2)}</span>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <div className="flex items-center gap-1">
                            <Select
                              size="s"
                              filterable
                              width="max"
                              placeholder="Uncategorized"
                              hasClear
                              value={catValue}
                              options={catOpts}
                              onUpdate={(vals) => {
                                const v = vals[0];
                                if (!v) updateReviewRow(i, { category_id: null, newCategoryName: null, newCategoryParent: null });
                                else if (!v.startsWith('newcat:')) updateReviewRow(i, { category_id: parseInt(v, 10), newCategoryName: null, newCategoryParent: null });
                              }}
                            />
                            <Button view="flat" size="s" onClick={promptNewCategory} title="Create a new category">＋</Button>
                          </div>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <div className="flex items-center gap-1">
                            <Select
                              size="s"
                              filterable
                              width="max"
                              placeholder="—"
                              hasClear
                              value={payeeValue}
                              options={payeeOptions}
                              onUpdate={(vals) => {
                                const v = vals[0];
                                if (!v) updateReviewRow(i, { payee_id: null, newPayeeName: null });
                                else if (v.startsWith('new:')) updateReviewRow(i, { payee_id: null, newPayeeName: v.slice(4) });
                                else updateReviewRow(i, { payee_id: parseInt(v, 10), newPayeeName: null });
                              }}
                            />
                            <Button view="flat" size="s" onClick={promptNewPayee} title="Create a new payee">＋</Button>
                          </div>
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <Checkbox
                            checked={row.rememberRule}
                            disabled={!row.category_id && !row.payee_id && !row.newPayeeName}
                            onUpdate={(checked) => updateReviewRow(i, { rememberRule: checked })}
                          />
                          {i === 0 || (reviewRows[i - 1]?.comments || '').trim().toLowerCase() !== (row.comments || '').trim().toLowerCase() ? (
                            <div>
                              <Button view="flat" size="s" onClick={() => applyRowToSimilar(i)} title="Apply this row's category & payee to all rows with the same description">↧ similar</Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs mt-2" style={{ opacity: 0.6 }}>
              Rows left uncategorized import as-is (no category/payee) and can be edited later. Check "Rule" to remember a description → category/payee for future imports.
            </p>
          </div>
        </Dialog.Body>
        <Dialog.Footer
          preset="default"
          textButtonCancel="Cancel"
          textButtonApply={importLoading ? 'Importing...' : `Import ${reviewRows.filter(r => r.include).length}`}
          onClickButtonCancel={handleReviewCancel}
          onClickButtonApply={handleReviewImport}
          propsButtonApply={{ disabled: importLoading || reviewRows.filter(r => r.include).length === 0, loading: importLoading }}
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

            <p className="text-xs text-slate-500">
              Possible duplicates are already flagged and unchecked in the review grid — this discrepancy is more likely a missing statement entry, an uncategorized fee, or a timezone issue. Please check your bank statement.
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
