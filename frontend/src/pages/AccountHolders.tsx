import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Button, Dialog, TextInput, TextArea, TableColumnConfig } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Edit, Trash2, User } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';

interface AccountHolder {
  account_holder_id: number;
  name: string;
  comments?: string;
}

export const AccountHolders: React.FC = () => {
  const [accountHolders, setAccountHolders] = useState<AccountHolder[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccountHolder, setEditingAccountHolder] = useState<AccountHolder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({ name: '', comments: '' });

  useEffect(() => {
    fetchAccountHolders();
  }, []);

  const fetchAccountHolders = async () => {
    try {
      const response = await fetch('/api/accounts/account-holders/');
      if (response.ok) {
        const data = await response.json();
        setAccountHolders(data.results || data);
      }
    } catch (error) {
      console.error('Failed to fetch account holders:', error);
      showError('Failed to fetch account holders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      showError('Please input the name!');
      return;
    }

    try {
      const url = editingAccountHolder 
        ? `/api/accounts/account-holders/${editingAccountHolder.account_holder_id}/`
        : '/api/accounts/account-holders/';
      
      const method = editingAccountHolder ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        flushSync(() => {
          setIsModalOpen(false);
          setEditingAccountHolder(null);
          setFormData({ name: '', comments: '' });
        });
        showSuccess(editingAccountHolder ? 'Account holder updated successfully' : 'Account holder created successfully');
        await fetchAccountHolders();
      } else {
        const errorData = await response.json();
        showError('Failed to save account holder', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to save account holder', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleEdit = (accountHolder: AccountHolder) => {
    setEditingAccountHolder(accountHolder);
    setFormData({
      name: accountHolder.name,
      comments: accountHolder.comments || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Account Holder',
      'Are you sure you want to delete this account holder?'
    );
    if (!confirmed) return;
    
    try {
      const response = await fetch(`/api/accounts/account-holders/${id}/`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        showSuccess('Account holder deleted successfully');
        await fetchAccountHolders();
      } else {
        showError('Failed to delete account holder');
      }
    } catch (error) {
      showError('Failed to delete account holder', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingAccountHolder(null);
    setFormData({ name: '', comments: '' });
  };
  
  const openCreateModal = () => {
    setEditingAccountHolder(null);
    setFormData({ name: '', comments: '' });
    setIsModalOpen(true);
  };

  const columns: TableColumnConfig<AccountHolder>[] = [
    {
      id: 'account_holder_id',
      name: 'ID',
      template: (item) => (
        <div className="flex items-center space-x-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{item.account_holder_id}</span>
        </div>
      )
    },
    {
      id: 'name',
      name: 'Name',
      template: (item) => <span className="font-medium">{item.name}</span>
    },
    {
      id: 'comments',
      name: 'Comments',
      template: (item) => <span className="text-sm text-muted-foreground">{item.comments || '-'}</span>
    },
    {
      id: 'actions',
      name: 'Actions',
      template: (item) => (
        <div className="flex items-center space-x-1">
          <Button view="flat" onClick={() => handleEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button view="flat-danger" onClick={() => handleDelete(item.account_holder_id)}>
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
        <h1 className="text-2xl font-bold">Account Holders</h1>
        <Button view="action" onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account Holder
        </Button>
      </div>
      
      <Dialog open={isModalOpen} onClose={handleCancel}>
        <Dialog.Header caption={editingAccountHolder ? 'Edit Account Holder' : 'Add Account Holder'} />
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
              <label className="block text-sm font-medium mb-1">Comments</label>
              <TextArea 
                value={formData.comments} 
                onUpdate={(val) => setFormData({ ...formData, comments: val })} 
                minRows={3}
              />
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer 
          preset="default"
          onClickButtonCancel={handleCancel}
          onClickButtonApply={handleSubmit}
          textButtonApply={editingAccountHolder ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>

      <Table
        columns={columns}
        data={accountHolders}
        getRowDescriptor={(item) => ({ id: String(item.account_holder_id) })}
        className="compact-table"
      />
    </div>
  );
};