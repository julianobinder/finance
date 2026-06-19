import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Button, Dialog, TextInput, TableColumnConfig } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Edit, Trash2, DollarSign } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';

interface Currency {
  currency_id: number;
  name: string;
  iso_code: string;
  symbol: string;
  order: number;
}

export const Currencies: React.FC = () => {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [formData, setFormData] = useState({ name: '', iso_code: '', symbol: '', order: 0 });

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchCurrencies = async () => {
    try {
      const response = await fetch('/api/accounts/currencies/');
      if (response.ok) {
        const data = await response.json();
        setCurrencies(data.results || data);
      } else {
        showError('Failed to fetch currencies');
      }
    } catch (error) {
      showError('Failed to fetch currencies', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      showError('Please input the name!');
      return;
    }
    if (!formData.iso_code) {
      showError('Please input the ISO code!');
      return;
    }
    if (!formData.symbol) {
      showError('Please input the symbol!');
      return;
    }
    if (formData.order === undefined || formData.order === null) {
      showError('Please input the order!');
      return;
    }

    try {
      const url = editingCurrency 
        ? `/api/accounts/currencies/${editingCurrency.currency_id}/`
        : '/api/accounts/currencies/';
      
      const method = editingCurrency ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        flushSync(() => {
          handleCancel();
        });
        showSuccess(editingCurrency ? 'Currency updated successfully' : 'Currency created successfully');
        await fetchCurrencies();
      } else {
        const errorData = await response.json();
        showError('Failed to save currency_id', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to save currency_id', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleEdit = (currency_id: Currency) => {
    setEditingCurrency(currency_id);
    setFormData({
      name: currency_id.name,
      iso_code: currency_id.iso_code,
      symbol: currency_id.symbol,
      order: currency_id.order,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Currency',
      'Are you sure you want to delete this currency_id?'
    );
    if (!confirmed) return;
    
    try {
      const response = await fetch(`/api/accounts/currencies/${id}/`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        showSuccess('Currency deleted successfully');
        await fetchCurrencies();
      } else {
        showError('Failed to delete currency_id');
      }
    } catch (error) {
      showError('Failed to delete currency_id', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingCurrency(null);
    setFormData({ name: '', iso_code: '', symbol: '', order: 0 });
  };
  
  const openCreateModal = () => {
    setEditingCurrency(null);
    setFormData({ name: '', iso_code: '', symbol: '', order: 0 });
    setIsModalOpen(true);
  };

  const columns: TableColumnConfig<Currency>[] = [
    {
      id: 'currency_id',
      name: 'ID',
      template: (item) => (
        <div className="flex items-center space-x-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{item.currency_id}</span>
        </div>
      )
    },
    {
      id: 'name',
      name: 'Name',
      template: (item) => <span className="font-medium">{item.name}</span>
    },
    {
      id: 'iso_code',
      name: 'ISO Code',
      template: (item) => <span className="text-sm">{item.iso_code}</span>
    },
    {
      id: 'symbol',
      name: 'Symbol',
      template: (item) => <span className="text-sm">{item.symbol}</span>
    },
    {
      id: 'order',
      name: 'Order',
      template: (item) => <span className="text-sm text-muted-foreground">{item.order}</span>
    },
    {
      id: 'actions',
      name: 'Actions',
      template: (item) => (
        <div className="flex items-center space-x-1">
          <Button view="flat" onClick={() => handleEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button view="flat-danger" onClick={() => handleDelete(item.currency_id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Currencies</h1>
        <Button view="action" onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Currency
        </Button>
      </div>
      
      <Dialog open={isModalOpen} onClose={handleCancel}>
        <Dialog.Header caption={editingCurrency ? 'Edit Currency' : 'Add Currency'} />
        <Dialog.Body>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <TextInput 
                value={formData.name} 
                onUpdate={(val) => setFormData({ ...formData, name: val })} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ISO Code</label>
              <TextInput 
                value={formData.iso_code} 
                onUpdate={(val) => setFormData({ ...formData, iso_code: val.toUpperCase().slice(0, 3) })} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Symbol</label>
              <TextInput 
                value={formData.symbol} 
                onUpdate={(val) => setFormData({ ...formData, symbol: val })} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Order</label>
              <TextInput 
                type="number"
                value={String(formData.order)} 
                onUpdate={(val) => setFormData({ ...formData, order: Number(val) })} 
              />
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer 
          preset="default"
          onClickButtonCancel={handleCancel}
          onClickButtonApply={handleSubmit}
          textButtonApply={editingCurrency ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>

      <Table
        columns={columns}
        data={currencies}
        getRowDescriptor={(item) => ({ id: String(item.currency_id) })}
        className="compact-table"
      />
    </div>
  );
};