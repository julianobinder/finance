import React, { useState, useEffect } from 'react';
import { X, Save, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

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
  groups_display: Array<{ account_group_id: number; name: string }>;
  groups?: Array<{ account_group_id: number; name: string }>;
  initial_balance?: string | number;
  order?: number;
}

interface LookupData {
  titulars: Array<{ titular_id: number; name: string }>;
  account_holders: Array<{ account_holder_id: number; name: string; comments?: string }>;
  account_types: Array<{ account_type_id: number; name: string; code: number }>;
  currencies: Array<{ currency_id: number; name: string; iso_code: string; symbol: string; order: number }>;
  account_groups: Array<{ account_group_id: number; name: string; is_hidden: boolean }>;
}

interface AccountModalProps {
  account?: Account | null;
  lookupData: LookupData;
  onClose: () => void;
  onSave: (account: Account) => void;
}

export function AccountModal({ account, lookupData, onClose, onSave }: AccountModalProps) {
  const [formData, setFormData] = useState<Partial<Account>>({
    name: '',
    titular_id: 0,
    account_holder_id: undefined,
    account_type_id: 0,
    sortcode: '',
    number: '',
    branch: '',
    currency_id: 0,
    is_closed: false,
    entry: new Date().toISOString().split('T')[0],
    comment: '',
    is_hidden: false,
    groups: [],
    initial_balance: '',
    order: 0,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (account) {
      setFormData({
        ...account,
        account_holder_id: account.account_holder_id || undefined,
        groups: account.groups_display || [],
        initial_balance: account.initial_balance !== undefined ? account.initial_balance.toString() : '0.00',
        order: account.order || 0,
      });
    } else {
      // Reset form for new account
      setFormData({
        name: '',
        titular_id: 0,
        account_holder_id: undefined,
        account_type_id: 0,
        sortcode: '',
        number: '',
        branch: '',
        currency_id: 0,
        is_closed: false,
        entry: new Date().toISOString().split('T')[0],
        comment: '',
        is_hidden: false,
        groups: [],
        initial_balance: '',
        order: 0,
      });
    }
  }, [account]);

  const handleInputChange = (field: keyof Account, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleGroupToggle = (groupId: number) => {
    setFormData(prev => {
      const currentGroups = prev.groups || [];
      const isSelected = currentGroups.some(group => group.account_group_id === groupId);
      
      if (isSelected) {
        // Remove group
        return {
          ...prev,
          groups: currentGroups.filter(group => group.account_group_id !== groupId)
        };
      } else {
        // Add group
        const groupToAdd = lookupData.account_groups.find(g => g.account_group_id === groupId);
        if (groupToAdd) {
          return {
            ...prev,
            groups: [...currentGroups, { account_group_id: groupToAdd.account_group_id, name: groupToAdd.name }]
          };
        }
        return prev;
      }
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Account name is required';
    }

    if (!formData.titular_id || formData.titular_id === 0) {
      newErrors.titular_id = 'Titular is required';
    }

    if (!formData.account_type_id || formData.account_type_id === 0) {
      newErrors.account_type_id = 'Account type is required';
    }

    if (!formData.currency_id || formData.currency_id === 0) {
      newErrors.currency_id = 'Currency is required';
    }

    if (!formData.entry) {
      newErrors.entry = 'Open date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const API_BASE_URL = '/api/accounts';
      const url = account ? `${API_BASE_URL}/${account.account_id}/` : `${API_BASE_URL}/`;
      const method = account ? 'PUT' : 'POST';

      // Create clean payload with only the fields the backend expects
      const payload = {
        name: formData.name,
        titular_id: formData.titular_id,
        account_holder_id: formData.account_holder_id,
        account_type_id: formData.account_type_id,
        sortcode: formData.sortcode,
        number: formData.number,
        branch: formData.branch,
        currency_id: formData.currency_id,
        is_closed: formData.is_closed,
        entry: formData.entry,
        comment: formData.comment,
        is_hidden: formData.is_hidden,
        groups: formData.groups || [],
        initial_balance: formData.initial_balance !== undefined && formData.initial_balance !== '' ? parseFloat(formData.initial_balance.toString()) : 0.0,
        order: formData.order || 0,
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save account');
      }

      const savedAccount = await response.json();
      onSave(savedAccount);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to save account' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl">
            {account ? 'Edit Account' : 'Create New Account'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.submit && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                <p className="text-destructive text-sm">{errors.submit}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Account Name *</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter account name"
                  />
                  {errors.name && <p className="text-destructive text-sm">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account_type_id">Account Type *</Label>
                  <Select
                    value={formData.account_type_id?.toString() || ''}
                    onValueChange={(value) => handleInputChange('account_type_id', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookupData.account_types.map((type) => (
                        <SelectItem key={type.account_type_id} value={type.account_type_id.toString()}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.account_type_id && <p className="text-destructive text-sm">{errors.account_type_id}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={formData.branch || ''}
                    onChange={(e) => handleInputChange('branch', e.target.value)}
                    placeholder="Enter branch"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="number">Number</Label>
                  <Input
                    id="number"
                    value={formData.number || ''}
                    onChange={(e) => handleInputChange('number', e.target.value)}
                    placeholder="Enter account number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entry">Open Date *</Label>
                  <Input
                    id="entry"
                    type="date"
                    value={formData.entry || ''}
                    onChange={(e) => handleInputChange('entry', e.target.value)}
                  />
                  {errors.entry && <p className="text-destructive text-sm">{errors.entry}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="initial_balance">Initial Balance</Label>
                  <Input
                    id="initial_balance"
                    type="number"
                    step="0.01"
                    value={formData.initial_balance !== undefined ? formData.initial_balance : ''}
                    onChange={(e) => handleInputChange('initial_balance', e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="order">Showing Order</Label>
                  <Input
                    id="order"
                    type="number"
                    value={formData.order !== undefined ? formData.order : 0}
                    onChange={(e) => handleInputChange('order', parseInt(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="titular_id">Titular *</Label>
                  <Select
                    value={formData.titular_id?.toString() || ''}
                    onValueChange={(value) => handleInputChange('titular_id', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select titular_id" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookupData.titulars.map((titular_id) => (
                        <SelectItem key={titular_id.titular_id} value={titular_id.titular_id.toString()}>
                          {titular_id.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.titular_id && <p className="text-destructive text-sm">{errors.titular_id}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account_holder_id">Account Holder</Label>
                  <Select
                    value={formData.account_holder_id?.toString() || ''}
                    onValueChange={(value) => handleInputChange('account_holder_id', value ? parseInt(value) : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account holder" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookupData.account_holders.map((holder) => (
                        <SelectItem key={holder.account_holder_id} value={holder.account_holder_id.toString()}>
                          {holder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sortcode">Sort Code</Label>
                  <Input
                    id="sortcode"
                    value={formData.sortcode || ''}
                    onChange={(e) => handleInputChange('sortcode', e.target.value)}
                    placeholder="Enter sort code"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency_id">Currency *</Label>
                  <Select
                    value={formData.currency_id?.toString() || ''}
                    onValueChange={(value) => handleInputChange('currency_id', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency_id" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookupData.currencies.map((currency_id) => (
                        <SelectItem key={currency_id.currency_id} value={currency_id.currency_id.toString()}>
                          {currency_id.symbol} - {currency_id.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.currency_id && <p className="text-destructive text-sm">{errors.currency_id}</p>}
                </div>

              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comments</Label>
              <Textarea
                id="comment"
                value={formData.comment || ''}
                onChange={(e) => handleInputChange('comment', e.target.value)}
                placeholder="Enter any additional comments"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Account Groups</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
                {lookupData.account_groups.map((group) => {
                  const isSelected = formData.groups?.some(g => g.account_group_id === group.account_group_id) || false;
                  return (
                    <div key={group.account_group_id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`group-${group.account_group_id}`}
                        checked={isSelected}
                        onCheckedChange={() => handleGroupToggle(group.account_group_id)}
                      />
                      <Label 
                        htmlFor={`group-${group.account_group_id}`}
                        className="text-sm cursor-pointer"
                      >
                        {group.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
              {formData.groups && formData.groups.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Selected: {formData.groups.map(g => g.name).join(', ')}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_closed"
                  checked={formData.is_closed || false}
                  onCheckedChange={(checked) => handleInputChange('is_closed', checked)}
                />
                <Label htmlFor="is_closed">This account is closed</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_hidden"
                  checked={formData.is_hidden || false}
                  onCheckedChange={(checked) => handleInputChange('is_hidden', checked)}
                />
                <Label htmlFor="is_hidden">Hide this account</Label>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <div>
                {account && (
                  <Button type="button" variant="destructive" onClick={() => {
                    // TODO: Implement delete functionality
                  }}>
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex space-x-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {loading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
