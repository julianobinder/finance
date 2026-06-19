import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Button, Dialog, TextInput, TableColumnConfig } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Edit2, Trash2, CreditCard } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';

interface AccountType {
  account_type_id: number;
  name: string;
  code: number;
}

export const AccountTypes: React.FC = () => {
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccountType, setEditingAccountType] = useState<AccountType | null>(null);
  
  const [formData, setFormData] = useState({ name: '', code: 0 });

  const fetchAccountTypes = async () => {
    try {
      const response = await fetch('/api/accounts/account-types/');
      const data = await response.json();
      setAccountTypes(data.results || data);
    } catch (error) {
      console.error('Error fetching account types:', error);
      showError('Failed to fetch account types');
    }
  };

  useEffect(() => {
    fetchAccountTypes();
  }, []);

  const handleSubmit = async () => {
    if (!formData.name) {
      showError('Please input the name!');
      return;
    }
    if (formData.code === undefined || formData.code === null) {
      showError('Please input the code!');
      return;
    }

    try {
      const url = editingAccountType
        ? `/api/accounts/account-types/${editingAccountType.account_type_id}/`
        : '/api/accounts/account-types/';
      const method = editingAccountType ? 'PUT' : 'POST';

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
          setEditingAccountType(null);
          setFormData({ name: '', code: 0 });
        });
        showSuccess(
          editingAccountType
            ? 'Account type updated successfully'
            : 'Account type created successfully'
        );
        await fetchAccountTypes();
      } else {
        const errorData = await response.json();
        showError('Failed to save account type', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to save account type', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDelete = async (account_type_id: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Account Type',
      'Are you sure you want to delete this account type?'
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/accounts/account-types/${account_type_id}/`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showSuccess('Account type deleted successfully');
        fetchAccountTypes();
      } else {
        showError('Failed to delete account type');
      }
    } catch (error) {
      showError('Failed to delete account type', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const openEditModal = (accountType: AccountType) => {
    setEditingAccountType(accountType);
    setFormData({
      name: accountType.name,
      code: accountType.code,
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingAccountType(null);
    setFormData({ name: '', code: 0 });
    setIsModalOpen(true);
  };
  
  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingAccountType(null);
    setFormData({ name: '', code: 0 });
  };

  const columns: TableColumnConfig<AccountType>[] = [
    {
      id: 'icon',
      name: 'Icon',
      template: () => <CreditCard className="h-4 w-4 text-green-600" />
    },
    {
      id: 'account_type_id',
      name: 'ID',
      template: (item) => item.account_type_id,
    },
    {
      id: 'name',
      name: 'Name',
      template: (item) => item.name,
    },
    {
      id: 'code',
      name: 'Code',
      template: (item) => item.code,
    },
    {
      id: 'actions',
      name: 'Actions',
      template: (item) => (
        <div className="flex space-x-1">
          <Button
            view="flat"
            onClick={() => openEditModal(item)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            view="flat-danger"
            onClick={() => handleDelete(item.account_type_id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Account Types</h1>
        <Button view="action" onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account Type
        </Button>
      </div>

      <Dialog open={isModalOpen} onClose={handleCancel}>
        <Dialog.Header caption={editingAccountType ? 'Edit Account Type' : 'Create Account Type'} />
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
              <label className="block text-sm font-medium mb-1">Code</label>
              <TextInput 
                type="number"
                value={String(formData.code)} 
                onUpdate={(val) => setFormData({ ...formData, code: Number(val) })} 
              />
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer 
          preset="default"
          onClickButtonCancel={handleCancel}
          onClickButtonApply={handleSubmit}
          textButtonApply={editingAccountType ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>

      <Table
        columns={columns}
        data={accountTypes}
        getRowDescriptor={(item) => ({ id: String(item.account_type_id) })}
        className="compact-table"
      />
    </div>
  );
};
