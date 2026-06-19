import React from 'react';
import { Edit, Trash2, CreditCard, Building, Calendar, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
  groups: Array<{ account_group_id: number; name: string }>;
}

interface AccountCardProps {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (accountId: number) => void;
}

export function AccountCard({ account, onEdit, onDelete }: AccountCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getAccountTypeIcon = (accountType: string) => {
    switch (accountType.toLowerCase()) {
      case 'current account':
        return <CreditCard className="h-4 w-4" />;
      case 'credit card':
        return <CreditCard className="h-4 w-4" />;
      case 'cash':
        return <DollarSign className="h-4 w-4" />;
      case 'assets':
        return <Building className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getAccountTypeIcon(account.accounttype_name)}
            <CardTitle className="text-lg">{account.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(account)}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(account.account_id)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Type</span>
          <Badge variant="secondary" className="text-xs">
            {account.accounttype_name}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Titular</span>
          <span className="text-sm font-medium">{account.titular_name}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Currency</span>
          <span className="text-sm font-medium">{account.currency_symbol}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Created</span>
          <div className="flex items-center gap-1 text-sm">
            <Calendar className="h-3 w-3" />
            {formatDate(account.entry)}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge 
            variant={account.is_active ? "default" : "destructive"}
            className="text-xs"
          >
            {account.is_active ? 'Active' : 'Closed'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
