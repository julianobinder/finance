import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, TextInput, TextArea, Select, Radio, Button, Loader } from '@gravity-ui/uikit';
import { Trash2, Plus, SplitSquareHorizontal, Calendar } from 'lucide-react';
import dayjs from 'dayjs';

import api from '../../services/api';
import { showError, showConfirmDelete } from '../../utils/notifications';

interface SelectOption {
    value: string;
    content: string;
}

export function TransactionModal({
  isOpen,
  onClose,
  accountId,
  accountName,
  transaction,
  onSave,
  onDelete,
  isImportMode,
  onIgnore,
  onCancelImport
}: any) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lookups
  const [payees, setPayees] = useState<SelectOption[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]); // Store full category_id objects
  const [rawAccounts, setRawAccounts] = useState<any[]>([]); // Store raw account objects with currencies
  const [currencies, setCurrencies] = useState<SelectOption[]>([]);

  // Filter States
  const [payeeFilter, setPayeeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('');

  const categories = React.useMemo(() => {
    return allCategories
      .filter((c: any) => !c.parent_category_id)
      .map((c: any) => ({ value: String(c.category_id), content: c.name }))
      .sort((a: any, b: any) => a.content.localeCompare(b.content));
  }, [allCategories]);

  const allCategoriesFormatted = React.useMemo(() => {
    return allCategories.map((c: any) => {
      if (c.parent_category_id) {
        const parent = allCategories.find((p: any) => p.category_id === c.parent_category_id);
        return {
          value: String(c.category_id),
          content: parent ? `${parent.name}: ${c.name}` : c.name
        };
      }
      return { value: String(c.category_id), content: c.name };
    }).sort((a: any, b: any) => a.content.localeCompare(b.content));
  }, [allCategories]);



  const [formData, setFormData] = useState<any>({
    transactionType: 'withdrawal',
    date: dayjs().format('YYYY-MM-DD'),
    splits: []
  });

  const subcategories = React.useMemo(() => {
    const parentId = formData.categoryId ? parseInt(formData.categoryId, 10) : null;
    if (!parentId || isNaN(parentId)) return [];
    return allCategories
      .filter((c: any) => c.parent_category_id === parentId)
      .map((c: any) => ({ value: String(c.category_id), content: c.name }))
      .sort((a: any, b: any) => a.content.localeCompare(b.content));
  }, [allCategories, formData.categoryId]);

  const [isSplit, setIsSplit] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const [lookupsLoading, setLookupsLoading] = useState(true);

  const transactionType = formData.transactionType;

  // Helper function to safely convert date values without timezone shifts
  const safeDateStr = (dateValue: any): string => {
    if (!dateValue) return '';
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
      return dateValue.substring(0, 10);
    }
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    const year = date.getUTCFullYear();
    if (year < 1900 || year > 2100) return '';
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchLookups = useCallback(async () => {
    try {
      setLookupsLoading(true);
      const response = await api.get('/transactions/lookup-data/');
      const data = response.data;
      
      const sortedPayees = [...data.payees]
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
        .map((p: any) => ({ value: String(p.payee_id), content: p.name }));
      setPayees(sortedPayees);
      
      setAllCategories(data.categories);
      
      setRawAccounts(data.accounts);
      setCurrencies(data.currencies.map((c: any) => ({ value: String(c.currency_id), content: `${c.iso_code} - ${c.name}` })));
      
      return data;
    } catch (error) {
      showError('Failed to load form data. Please try again.');
      return null;
    } finally {
      setLookupsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (!isOpen) return;

    setPayeeFilter('');
    setCategoryFilter('');
    setSubcategoryFilter('');

    const loadDataAndPopulateForm = async () => {
      const lookupData = await fetchLookups();
      
      if (!lookupData) {
        console.error('Failed to load lookup data');
        return;
      }

      if (transaction) {
        let tType = 'withdrawal';
        if (transaction.to_account_id || transaction.transfer_transaction_id) {
          tType = 'transfer';
        } else if (transaction.amount > 0) {
          tType = 'deposit';
        }

        const statusMap: Record<number, string> = {
          1: 'reconciled',
          2: 'clear',
          3: 'unclear'
        };
        const statusValue = typeof transaction.status === 'number' 
          ? statusMap[transaction.status] 
          : transaction.status_name?.toLowerCase();

        let categoryIdValue = transaction.category_id ? String(transaction.category_id) : undefined;
        let subCategoryIdValue = undefined;
        
        if (transaction.category_id) {
          const transactionCategory = lookupData.categories.find((c: any) => c.category_id === transaction.category_id);
          
          if (transactionCategory && transactionCategory.parent_category_id) {
            categoryIdValue = String(transactionCategory.parent_category_id);
            subCategoryIdValue = String(transaction.category_id);
            

          }
        }

        let payeeDisplayValue: string | undefined = undefined;
        if (transaction.payee_id) {
          const payeeOption = lookupData.payees.find((p: any) => p.payee_id === transaction.payee_id);
          if (payeeOption) {
            payeeDisplayValue = String(payeeOption.payee_id);
          }
        }
        if (!payeeDisplayValue && (transaction.payee_name || transaction.payee_desc)) {
          payeeDisplayValue = transaction.payee_name || transaction.payee_desc;
        }

        const newFormData: any = {
          transactionType: tType,
          payeeId: payeeDisplayValue,
          categoryId: categoryIdValue,
          subCategoryId: subCategoryIdValue,
          toAccountId: transaction.to_account_id ? String(transaction.to_account_id) : undefined,
          statusId: statusValue || 'clear',
          amount: String(Math.abs(transaction.amount)),
          comments: transaction.comment || transaction.comments || '',
          reference: transaction.reference || '',
          date: safeDateStr(transaction.cash || transaction.date),
          referto: safeDateStr(transaction.referto),
          issue: safeDateStr(transaction.issue),
          due: safeDateStr(transaction.due),
          payment: safeDateStr(transaction.payment),
          received: safeDateStr(transaction.received),
          original_currency: transaction.original_currency_id ? String(transaction.original_currency_id) : undefined,
          original_amount: transaction.original_amount ? String(transaction.original_amount) : undefined,
          exchangeRate: '',
          splits: transaction.splits || []
        };
        
        const hasExtendedDates = !!(
          transaction.referto || 
          transaction.issue || 
          transaction.due || 
          transaction.payment || 
          transaction.received ||
          transaction.to_account_issue ||
          transaction.to_account_received ||
          transaction.to_account_referto ||
          transaction.to_account_due ||
          transaction.to_account_payment
        );
        setShowAllDates(hasExtendedDates);

        if (tType === 'transfer') {
          const isIncoming = transaction.amount > 0;
          
          newFormData.dest_date = safeDateStr(transaction.to_account_cash || transaction.cash || transaction.date);
          newFormData.dest_payment = safeDateStr(transaction.to_account_payment);
          newFormData.dest_received = safeDateStr(transaction.to_account_received);
          newFormData.dest_issue = safeDateStr(transaction.to_account_issue);
          newFormData.dest_due = safeDateStr(transaction.to_account_due);
          newFormData.dest_referto = safeDateStr(transaction.to_account_referto);
          newFormData.destinationAmount = transaction.to_account_amount ? String(Math.abs(transaction.to_account_amount)) : '';

          const rateToLoad = isIncoming 
             ? (transaction.rate && transaction.rate !== 1.0 ? String(transaction.rate) : '')
             : (transaction.to_account_rate && transaction.to_account_rate !== 1.0 ? String(transaction.to_account_rate) : '');
             
          if (rateToLoad) {
             newFormData.exchangeRate = rateToLoad;
          }
        } else if (transaction.rate && transaction.rate !== 1.0) {
           newFormData.exchangeRate = String(transaction.rate);
        }

        setFormData(newFormData);
        setIsSplit(transaction.is_split || false);
      } else {
        setFormData({
          transactionType: 'withdrawal',
          date: dayjs().format('YYYY-MM-DD'),
          statusId: 'clear',
          splits: []
        });
        setIsSplit(false);
        setShowAllDates(false);
      }
    };

    loadDataAndPopulateForm();
  }, [isOpen, transaction, fetchLookups]);

  useEffect(() => {
    if (transactionType !== 'transfer' || !formData.toAccountId || rawAccounts.length === 0) {
      return;
    }

    const sourceAcc = rawAccounts.find((a: any) => String(a.account_id) === String(accountId));
    const destAcc = rawAccounts.find((a: any) => String(a.account_id) === String(formData.toAccountId));

    if (!sourceAcc || !destAcc) return;

    const sourceCurr = sourceAcc.currency_iso_code?.toUpperCase();
    const destCurr = destAcc.currency_iso_code?.toUpperCase();

    if (!sourceCurr || !destCurr) return;

    // Suggest rate if currencies are different
    if (sourceCurr !== destCurr) {
      const fetchSuggestedRate = async () => {
        try {
          const response = await api.get('/accounts/consolidated-balances/');
          const rates = response.data.rates;
          
          if (rates && rates[sourceCurr] && rates[destCurr]) {
            const calculatedRate = rates[destCurr] / rates[sourceCurr];
            const rateStr = calculatedRate.toFixed(6);
            
            setFormData((prev: any) => {
              const updated = { ...prev, exchangeRate: rateStr };
              // Automatically compute destinationAmount if amount is present
              if (prev.amount) {
                const sourceAmount = parseFloat(prev.amount);
                if (!isNaN(sourceAmount)) {
                  updated.destinationAmount = (sourceAmount * calculatedRate).toFixed(2);
                }
              }
              return updated;
            });
          }
        } catch (error) {
          console.error('Failed to fetch suggested exchange rate:', error);
        }
      };
      
      // Only fetch if exchangeRate is not already set manually (to avoid overriding edited rates)
      if (!formData.exchangeRate) {
        fetchSuggestedRate();
      }
    } else {
      // If same currency_id, set exchangeRate to 1.0 or empty, and sync destinationAmount
      setFormData((prev: any) => {
        const updated = { ...prev, exchangeRate: '1.000000' };
        if (prev.amount) {
          updated.destinationAmount = parseFloat(prev.amount).toFixed(2);
        }
        return updated;
      });
    }
  }, [formData.toAccountId, transactionType, accountId, rawAccounts, formData.amount]);

  const handlePayeeUpdate = async (val: string[]) => {
    const selected = val[0];
    if (!selected) {
      setFormData((prev: any) => ({ ...prev, payeeId: undefined }));
      return;
    }
    const isNumeric = /^\d+$/.test(selected);
    if (!isNumeric) {
      try {
        setLookupsLoading(true);
        const response = await api.post('/accounts/payees/', { name: selected });
        const newPayee = response.data;
        setPayees(prev => [...prev, { value: String(newPayee.payee_id), content: newPayee.name }]
          .sort((a, b) => a.content.localeCompare(b.content))
        );
        setFormData((prev: any) => ({ ...prev, payeeId: String(newPayee.payee_id) }));
        setPayeeFilter('');
      } catch (error) {
        showError('Could not create new payee');
      } finally {
        setLookupsLoading(false);
      }
    } else {
      setFormData((prev: any) => ({ ...prev, payeeId: selected }));
    }
  };

  const handleCategoryUpdate = async (val: string[]) => {
    const selected = val[0];
    if (!selected) {
      setFormData((prev: any) => ({ ...prev, categoryId: undefined, subCategoryId: undefined }));
      return;
    }
    const isNumeric = /^\d+$/.test(selected);
    if (!isNumeric) {
      try {
        setLookupsLoading(true);
        const response = await api.post('/accounts/categories/', {
          name: selected,
          parent_category_id: null,
          is_hidden: false,
          order: 0
        });
        const newCategory = response.data;
        setAllCategories(prev => [...prev, newCategory]);
        setFormData((prev: any) => ({ ...prev, categoryId: String(newCategory.category_id), subCategoryId: undefined }));
        setCategoryFilter('');
      } catch (error) {
        showError('Could not create new category');
      } finally {
        setLookupsLoading(false);
      }
    } else {
      setFormData((prev: any) => ({ ...prev, categoryId: selected, subCategoryId: undefined }));
    }
  };

  const handleSubcategoryUpdate = async (val: string[]) => {
    const selected = val[0];
    if (!selected) {
      setFormData((prev: any) => ({ ...prev, subCategoryId: undefined }));
      return;
    }
    const isNumeric = /^\d+$/.test(selected);
    if (!isNumeric) {
      if (!formData.categoryId) {
        showError('Please select a parent category first');
        return;
      }
      try {
        setLookupsLoading(true);
        const response = await api.post('/accounts/categories/', {
          name: selected,
          parent_category_id: parseInt(formData.categoryId, 10),
          is_hidden: false,
          order: 0
        });
        const newSubcategory = response.data;
        setAllCategories(prev => [...prev, newSubcategory]);
        setFormData((prev: any) => ({ ...prev, subCategoryId: String(newSubcategory.category_id) }));
        setSubcategoryFilter('');
      } catch (error) {
        showError('Could not create new subcategory');
      } finally {
        setLookupsLoading(false);
      }
    } else {
      setFormData((prev: any) => ({ ...prev, subCategoryId: selected }));
    }
  };
  
  const handleFinish = async () => {
      if (isSubmitting || lookupsLoading) return;
      // Validation
      if (transactionType !== 'transfer' && !formData.payeeId) {
        showError('Please select or create a payee_id');
        return;
      }
      if (transactionType !== 'transfer' && !isSplit && !formData.categoryId) {
        showError('Please select a category_id');
        return;
      }
      if (transactionType === 'transfer' && !formData.toAccountId) {
        showError('Please select an account');
        return;
      }
      if (!formData.amount) {
        showError('Please input the amount!');
        return;
      }
      if (!formData.date) {
        showError('Please select a date');
        return;
      }

      setIsSubmitting(true);
      
      const payload: any = {
        accountId: accountId,
        transactionType: formData.transactionType,
        amount: parseFloat(formData.amount),
        cash: formData.date,
      };
      
      if (formData.referto) payload.referto = formData.referto;
      if (formData.issue) payload.issue = formData.issue;
      if (formData.due) payload.due = formData.due;
      if (formData.payment) payload.payment = formData.payment;
      if (formData.received) payload.received = formData.received;
      
      if (formData.comments) payload.comment = formData.comments;
      if (formData.reference) payload.reference = formData.reference;
      
      if (formData.statusId) {
        const statusNameToId: Record<string, number> = {
          'reconciled': 1,
          'clear': 2,
          'unclear': 3
        };
        payload.status = statusNameToId[formData.statusId];
      }

      if (formData.transactionType === 'transfer') {
          payload.toAccountId = formData.toAccountId ? parseInt(formData.toAccountId, 10) : undefined;
          if (formData.original_currency) payload.original_currency_id = parseInt(formData.original_currency, 10);
          if (formData.original_amount) payload.original_amount = parseFloat(formData.original_amount);
          if (formData.exchangeRate) payload.currencyRate = parseFloat(formData.exchangeRate);
          if (formData.destinationAmount) payload.destinationAmount = parseFloat(formData.destinationAmount);
          
          if (formData.dest_date) payload.toAccountCash = formData.dest_date;
          if (formData.dest_issue) payload.toAccountIssue = formData.dest_issue;
          if (formData.dest_received) payload.toAccountReceived = formData.dest_received;
          if (formData.dest_referto) payload.toAccountReferTo = formData.dest_referto;
          if (formData.dest_due) payload.toAccountDue = formData.dest_due;
          if (formData.dest_payment) payload.toAccountPayment = formData.dest_payment;
      } else {
          // Payee logic - can be an existing ID or a new name
          const isNumeric = /^\d+$/.test(formData.payeeId);
          if (isNumeric) {
              payload.payee_id = parseInt(formData.payeeId, 10);
          } else if (formData.payeeId) {
             try {
                const response = await api.post('/accounts/payees/', { name: formData.payeeId });
                payload.payee_id = response.data.payee_id;
             } catch(e) {
                showError('Could not create new payee_id');
                setIsSubmitting(false);
                return;
             }
          }

          const categoryValue = formData.subCategoryId || formData.categoryId;
          payload.category_id = categoryValue ? parseInt(categoryValue, 10) : undefined;
          
          if (formData.original_currency) payload.original_currency_id = parseInt(formData.original_currency, 10);
          if (formData.original_amount) payload.original_amount = parseFloat(formData.original_amount);
          
          if (isSplit && formData.splits) {
              const sumSplits = formData.splits
                  .filter((s: any) => s && s.amount)
                  .reduce((sum: number, s: any) => sum + Math.abs(parseFloat(s.amount)), 0);
              const totalAmount = Math.abs(parseFloat(formData.amount));
              if (isNaN(totalAmount) || Math.abs(sumSplits - totalAmount) > 0.01) {
                  showError('The sum of split amounts must equal the transaction\'s total amount.');
                  setIsSubmitting(false);
                  return;
              }

              payload.splits = formData.splits
                  .filter((s: any) => s && s.categoryId && s.amount)
                  .map((s: any) => ({ 
                    category_id: parseInt(s.categoryId, 10), 
                    amount: parseFloat(s.amount), 
                    comment: s.comment
                  }));
          }
      }

      try {
          await onSave(payload, transaction ? transaction.transaction_id : null);
      } catch (error) {
          // Error shown by parent
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleDelete = () => {
    if (transaction) {
      showConfirmDelete(
        'Delete Transaction',
        'Are you sure you want to delete this transaction?',
        () => onDelete(transaction.transaction_id)
      );
    }
  };
  
  const handleExchangeRateBlur = () => {
    const amount = formData.amount;
    const rate = formData.exchangeRate;
    
    if (amount && rate) {
      const sourceAmount = parseFloat(amount);
      const exchangeRate = parseFloat(rate);
      if (!isNaN(sourceAmount) && !isNaN(exchangeRate)) {
        const calculated = (sourceAmount * exchangeRate).toFixed(2);
        setFormData((prev: any) => ({ ...prev, destinationAmount: calculated }));
      }
    }
  };

  const handleDestinationAmountBlur = () => {
    const amount = formData.amount;
    const destAmount = formData.destinationAmount;
    
    if (amount && destAmount) {
      const sourceAmount = parseFloat(amount);
      const destinationAmount = parseFloat(destAmount);
      if (!isNaN(sourceAmount) && !isNaN(destinationAmount) && sourceAmount !== 0) {
        const calculated = (destinationAmount / sourceAmount).toFixed(6);
        setFormData((prev: any) => ({ ...prev, exchangeRate: calculated }));
      }
    }
  };

  const handleAmountBlur = () => {
    const amount = formData.amount;
    const rate = formData.exchangeRate;
    
    if (amount && rate) {
      const sourceAmount = parseFloat(amount);
      const exchangeRate = parseFloat(rate);
      if (!isNaN(sourceAmount) && !isNaN(exchangeRate)) {
        const calculated = (sourceAmount * exchangeRate).toFixed(2);
        setFormData((prev: any) => ({ ...prev, destinationAmount: calculated }));
      }
    }
  };

  const isEditing = !!transaction;
  const isOriginalTransfer = isEditing && (transaction.to_account_id || transaction.transfer_transaction_id);

  return (
    <Dialog open={isOpen} onClose={onClose} size={transactionType === 'transfer' ? 'l' : 'm'}>
      <Dialog.Header caption={transaction ? `${accountName} - Edit Transaction` : `${accountName} - New Transaction`} />
      <Dialog.Body>
        {lookupsLoading ? (
          <div className="flex flex-col items-center justify-center p-8">
            <Loader size="l" />
            <div className="mt-4">Loading form data...</div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-6 border-b border-gray-200 pb-4">
              <Radio
                value="withdrawal"
                checked={transactionType === 'withdrawal'}
                onChange={() => setFormData((prev: any) => ({ ...prev, transactionType: 'withdrawal' }))}
                disabled={isOriginalTransfer}
              >
                Withdrawal
              </Radio>
              <Radio
                value="deposit"
                checked={transactionType === 'deposit'}
                onChange={() => setFormData((prev: any) => ({ ...prev, transactionType: 'deposit' }))}
                disabled={isOriginalTransfer}
              >
                Deposit
              </Radio>
              <Radio
                value="transfer"
                checked={transactionType === 'transfer'}
                onChange={() => setFormData((prev: any) => ({ ...prev, transactionType: 'transfer' }))}
                disabled={isEditing && !isOriginalTransfer}
              >
                Transfer
              </Radio>
            </div>

            <div className="flex gap-4">
              <div className="flex-1 flex flex-col gap-4">
              {transactionType !== 'transfer' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Payee</label>
                    <Select
                      filterable
                      placeholder="Select or type payee_id"
                      value={formData.payeeId ? [formData.payeeId] : []}
                      onUpdate={handlePayeeUpdate}
                      onFilterChange={(filter) => setPayeeFilter(filter)}
                      options={(() => {
                        const payeeOptions = [...payees];
                        if (payeeFilter.trim()) {
                          const exists = payees.some((p) => p.content.toLowerCase() === payeeFilter.trim().toLowerCase());
                          if (!exists) {
                            payeeOptions.unshift({
                              value: payeeFilter.trim(),
                              content: `Create "${payeeFilter.trim()}"`
                            });
                          }
                        }
                        return payeeOptions;
                      })()}
                      width="max"
                    />
                  </div>

                  {!isSplit && (
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Category</label>
                        <Select
                          filterable
                          placeholder="Select category_id"
                          value={formData.categoryId ? [formData.categoryId] : []}
                          onUpdate={handleCategoryUpdate}
                          onFilterChange={(filter) => setCategoryFilter(filter)}
                          options={(() => {
                            const categoryOptions = [...categories];
                            if (categoryFilter.trim()) {
                              const exists = categories.some((c) => c.content.toLowerCase() === categoryFilter.trim().toLowerCase());
                              if (!exists) {
                                categoryOptions.unshift({
                                  value: categoryFilter.trim(),
                                  content: `Create "${categoryFilter.trim()}"`
                                });
                              }
                            }
                            return categoryOptions;
                          })()}
                          width="max"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Sub-Category</label>
                        <Select
                          filterable
                          placeholder="Select sub-category_id"
                          value={formData.subCategoryId ? [formData.subCategoryId] : []}
                          onUpdate={handleSubcategoryUpdate}
                          onFilterChange={(filter) => setSubcategoryFilter(filter)}
                          options={(() => {
                            const subcategoryOptions = [...subcategories];
                            if (subcategoryFilter.trim()) {
                              const exists = subcategories.some((sc) => sc.content.toLowerCase() === subcategoryFilter.trim().toLowerCase());
                              if (!exists) {
                                subcategoryOptions.unshift({
                                  value: subcategoryFilter.trim(),
                                  content: `Create "${subcategoryFilter.trim()}"`
                                });
                              }
                            }
                            return subcategoryOptions;
                          })()}
                          width="max"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {transactionType === 'transfer' && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {transaction && transaction.amount > 0 ? "Source Account" : "Destination Account"}
                  </label>
                  <Select
                    filterable
                    placeholder="Select account"
                    value={formData.toAccountId ? [formData.toAccountId] : []}
                    onUpdate={(val) => setFormData((prev: any) => ({ ...prev, toAccountId: val[0], exchangeRate: '' }))}
                    options={rawAccounts
                      .filter(acc => {
                        const isSelected = String(acc.account_id) === String(formData.toAccountId);
                        return (!acc.is_closed && !acc.is_hidden && String(acc.account_id) !== String(accountId)) || isSelected;
                      })
                      .map((acc: any) => ({
                        value: String(acc.account_id),
                        content: acc.full_name || acc.name
                      }))
                    }
                    disabled={isOriginalTransfer}
                    width="max"
                  />
                </div>
              )}

              {transactionType !== 'transfer' && (
                <div className="flex gap-4">
                  <div className="flex-[2]">
                    <label className="block text-sm font-medium mb-1">Comments</label>
                    <TextArea
                      value={formData.comments}
                      onUpdate={(val) => setFormData((prev: any) => ({ ...prev, comments: val }))}
                      minRows={2}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">Reference</label>
                    <TextInput
                      value={formData.reference}
                      onUpdate={(val) => setFormData((prev: any) => ({ ...prev, reference: val }))}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-end gap-4">
                <div className="flex-[2]">
                  <label className="block text-sm font-medium mb-1">
                    {transactionType === 'transfer' ? (transaction && transaction.amount > 0 ? "Destination Amount" : "Source Amount") : "Amount"}
                  </label>
                  <TextInput
                    value={formData.amount}
                    onUpdate={(val) => setFormData((prev: any) => ({ ...prev, amount: val }))}
                    onBlur={transactionType === 'transfer' ? handleAmountBlur : undefined}
                    placeholder="0.00"
                  />
                </div>
                {transactionType !== 'transfer' && (
                  <div className="flex-1">
                    <Button onClick={() => setIsSplit(!isSplit)} width="max">
                      <SplitSquareHorizontal className="mr-2 h-4 w-4" /> Split
                    </Button>
                  </div>
                )}
              </div>

              {isSplit && transactionType !== 'transfer' && (
                <div className="bg-gray-50 p-4 rounded border">
                  <div className="flex justify-between font-semibold mb-2 text-sm text-gray-700">
                    <span>Category: Sub-Category</span>
                    <span>Amount</span>
                  </div>
                  {formData.splits.map((split: any, index: number) => (
                    <div key={index} className="flex gap-2 mb-2 items-center">
                      <div className="flex-[2]">
                        <Select
                          filterable
                          placeholder="Category: Sub-Category"
                          value={split.categoryId ? [split.categoryId] : []}
                          onUpdate={(val) => {
                            const newSplits = [...formData.splits];
                            newSplits[index].categoryId = val[0];
                            setFormData((prev: any) => ({ ...prev, splits: newSplits }));
                          }}
                          options={allCategoriesFormatted}
                          width="max"
                        />
                      </div>
                      <div className="flex-1">
                        <TextInput
                          value={split.amount}
                          onUpdate={(val) => {
                            const newSplits = [...formData.splits];
                            newSplits[index].amount = val;
                            setFormData((prev: any) => ({ ...prev, splits: newSplits }));
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <Button view="flat-danger" onClick={() => {
                        const newSplits = [...formData.splits];
                        newSplits.splice(index, 1);
                        setFormData((prev: any) => ({ ...prev, splits: newSplits }));
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="text-right font-semibold text-sm my-2">
                    Total: {parseFloat(formData.amount || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <Button width="max" view="outlined" onClick={() => {
                    setFormData((prev: any) => ({ ...prev, splits: [...prev.splits, { categoryId: '', amount: '' }] }));
                  }}>
                    <Plus className="mr-2 h-4 w-4" /> Add Split
                  </Button>
                </div>
              )}

              <div className="flex gap-4 items-center">
                <Radio
                  value="reconciled"
                  checked={formData.statusId === 'reconciled'}
                  onChange={() => setFormData((prev: any) => ({ ...prev, statusId: 'reconciled' }))}
                >
                  Reconciled
                </Radio>
                <Radio
                  value="clear"
                  checked={formData.statusId === 'clear'}
                  onChange={() => setFormData((prev: any) => ({ ...prev, statusId: 'clear' }))}
                >
                  Clear
                </Radio>
                <Radio
                  value="unclear"
                  checked={formData.statusId === 'unclear'}
                  onChange={() => setFormData((prev: any) => ({ ...prev, statusId: 'unclear' }))}
                >
                  Unclear
                </Radio>
              </div>

              {transactionType === 'transfer' && (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Exchange Rate</label>
                      <TextInput
                        value={formData.exchangeRate}
                        onUpdate={(val) => setFormData((prev: any) => ({ ...prev, exchangeRate: val }))}
                        onBlur={handleExchangeRateBlur}
                        placeholder="e.g., 1.2345"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">
                        {transaction && transaction.amount > 0 ? "Source Amount" : "Destination Amount"}
                      </label>
                      <TextInput
                        value={formData.destinationAmount}
                        onUpdate={(val) => setFormData((prev: any) => ({ ...prev, destinationAmount: val }))}
                        onBlur={handleDestinationAmountBlur}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Original Currency</label>
                      <Select
                        filterable
                        placeholder="Select currency_id"
                        value={formData.original_currency ? [formData.original_currency] : []}
                        onUpdate={(val) => setFormData((prev: any) => ({ ...prev, original_currency: val[0] }))}
                        options={currencies}
                        width="max"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Original Amount</label>
                      <TextInput
                        value={formData.original_amount}
                        onUpdate={(val) => setFormData((prev: any) => ({ ...prev, original_amount: val }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </>
              )}

              {transactionType !== 'transfer' && (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">Original Currency</label>
                    <Select
                      filterable
                      placeholder="Select currency_id"
                      value={formData.original_currency ? [formData.original_currency] : []}
                      onUpdate={(val) => setFormData((prev: any) => ({ ...prev, original_currency: val[0] }))}
                      options={currencies}
                      width="max"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">Original Amount</label>
                    <TextInput
                      value={formData.original_amount}
                      onUpdate={(val) => setFormData((prev: any) => ({ ...prev, original_amount: val }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={`flex flex-col gap-4 border-l border-gray-200 pl-4 ${transactionType === 'transfer' ? 'w-80' : 'w-44'}`}>
              <div className="flex justify-end">
                <Button view="flat" size="s" onClick={() => setShowAllDates(!showAllDates)} title={showAllDates ? "Hide additional dates" : "Show additional dates"}>
                  <Calendar className="h-4 w-4" />
                </Button>
              </div>

              {transactionType === 'transfer' ? (
                <div className="flex gap-4">
                  <div className="flex-1 flex flex-col gap-3">
                    <h4 className="font-semibold text-sm m-0">
                      {transaction && transaction.amount > 0 ? 'Destination' : 'Source'}
                    </h4>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-500">Cash at</label>
                      <input type="date" className="w-full border rounded p-1.5" value={formData.date} onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))} />
                    </div>
                    {showAllDates && (
                      <>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Paid at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.payment} onChange={(e) => setFormData((prev: any) => ({ ...prev, payment: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Received at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.received} onChange={(e) => setFormData((prev: any) => ({ ...prev, received: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Issued at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.issue} onChange={(e) => setFormData((prev: any) => ({ ...prev, issue: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Due at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.due} onChange={(e) => setFormData((prev: any) => ({ ...prev, due: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Refer to</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.referto} onChange={(e) => setFormData((prev: any) => ({ ...prev, referto: e.target.value }))} />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-3">
                    <h4 className="font-semibold text-sm m-0">
                      {transaction && transaction.amount > 0 ? 'Source' : 'Destination'}
                    </h4>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-500">Cash at</label>
                      <input type="date" className="w-full border rounded p-1.5" value={formData.dest_date} onChange={(e) => setFormData((prev: any) => ({ ...prev, dest_date: e.target.value }))} />
                    </div>
                    {showAllDates && (
                      <>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Paid at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.dest_payment} onChange={(e) => setFormData((prev: any) => ({ ...prev, dest_payment: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Received at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.dest_received} onChange={(e) => setFormData((prev: any) => ({ ...prev, dest_received: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Issued at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.dest_issue} onChange={(e) => setFormData((prev: any) => ({ ...prev, dest_issue: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Due at</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.dest_due} onChange={(e) => setFormData((prev: any) => ({ ...prev, dest_due: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500">Refer to</label>
                          <input type="date" className="w-full border rounded p-1.5" value={formData.dest_referto} onChange={(e) => setFormData((prev: any) => ({ ...prev, dest_referto: e.target.value }))} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-500">Cash at</label>
                    <input type="date" className="w-full border rounded p-1.5" value={formData.date} onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))} />
                  </div>
                  {showAllDates && (
                    <>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-500">Paid at</label>
                        <input type="date" className="w-full border rounded p-1.5" value={formData.payment} onChange={(e) => setFormData((prev: any) => ({ ...prev, payment: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-500">Received at</label>
                        <input type="date" className="w-full border rounded p-1.5" value={formData.received} onChange={(e) => setFormData((prev: any) => ({ ...prev, received: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-500">Issued at</label>
                        <input type="date" className="w-full border rounded p-1.5" value={formData.issue} onChange={(e) => setFormData((prev: any) => ({ ...prev, issue: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-500">Due at</label>
                        <input type="date" className="w-full border rounded p-1.5" value={formData.due} onChange={(e) => setFormData((prev: any) => ({ ...prev, due: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-500">Refer to</label>
                        <input type="date" className="w-full border rounded p-1.5" value={formData.referto} onChange={(e) => setFormData((prev: any) => ({ ...prev, referto: e.target.value }))} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </Dialog.Body>
      <Dialog.Footer
        preset="default"
        textButtonCancel="Cancel"
        textButtonApply="Save"
        onClickButtonCancel={onCancelImport || onClose}
        onClickButtonApply={handleFinish}
        propsButtonApply={{ loading: isSubmitting || lookupsLoading, disabled: isSubmitting || lookupsLoading }}
      >
        {isImportMode ? (
          <Button view="flat-warning" onClick={onIgnore} className="mr-auto">
            Ignore
          </Button>
        ) : (
          transaction && (
            <Button view="flat-danger" onClick={handleDelete} className="mr-auto">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )
        )}
      </Dialog.Footer>
    </Dialog>
  );
}
