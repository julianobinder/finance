import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Button, Dialog, TextInput, Checkbox, TableColumnConfig } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';

interface AccountGroup {
  account_group_id: number;
  name: string;
  is_hidden: boolean;
  order: number;
}

export const AccountGroups: React.FC = () => {
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAccountGroup, setEditingAccountGroup] = useState<AccountGroup | null>(null);
  
  const [formData, setFormData] = useState({ name: '', is_hidden: false, order: 0 });

  const fetchAccountGroups = async () => {
    try {
      const response = await fetch('/api/accounts/account-groups/');
      const data = await response.json();
      setAccountGroups(data.results || data);
    } catch (error) {
      console.error('Error fetching account groups:', error);
      showError('Failed to fetch account groups');
    }
  };

  useEffect(() => {
    fetchAccountGroups();
  }, []);

  const handleCreate = async () => {
    if (!formData.name) {
      showError('Please input the account group name!');
      return;
    }
    try {
      const response = await fetch('/api/accounts/account-groups/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
        }),
      });
      
      if (response.ok) {
        flushSync(() => {
          setIsCreateModalOpen(false);
          setFormData({ name: '', is_hidden: false, order: 0 });
        });
        showSuccess('Account group created successfully');
        await fetchAccountGroups();
      } else {
        const errorData = await response.json();
        showError('Failed to create account group', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to create account group', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleEdit = async () => {
    if (!editingAccountGroup) return;
    if (!formData.name) {
      showError('Please input the account group name!');
      return;
    }

    try {
      const response = await fetch(`/api/accounts/account-groups/${editingAccountGroup.account_group_id}/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        flushSync(() => {
          setIsEditModalOpen(false);
          setEditingAccountGroup(null);
          setFormData({ name: '', is_hidden: false, order: 0 });
        });
        showSuccess('Account group updated successfully');
        await fetchAccountGroups();
      } else {
        const errorData = await response.json();
        showError('Failed to update account group', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to update account group', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDelete = async (account_group_id: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Account Group',
      'Are you sure you want to delete this account group?'
    );
    if (!confirmed) return;
    
    try {
      const response = await fetch(`/api/accounts/account-groups/${account_group_id}/`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        showSuccess('Account group deleted successfully');
        fetchAccountGroups();
      } else {
        showError('Failed to delete account group');
      }
    } catch (error) {
      showError('Failed to delete account group', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const openCreateModal = () => {
    setFormData({ name: '', is_hidden: false, order: 0 });
    setIsCreateModalOpen(true);
  };

  const openEditModal = (accountGroup: AccountGroup) => {
    setEditingAccountGroup(accountGroup);
    setFormData({
      name: accountGroup.name,
      is_hidden: accountGroup.is_hidden,
      order: accountGroup.order || 0,
    });
    setIsEditModalOpen(true);
  };

  const columns: TableColumnConfig<AccountGroup>[] = [
    {
      id: 'icon',
      name: 'Icon',
      template: () => <Users className="h-4 w-4 text-green-600" />
    },
    {
      id: 'account_group_id',
      name: 'ID',
      template: (item) => item.account_group_id,
    },
    {
      id: 'name',
      name: 'Name',
      template: (item) => item.name,
    },
    {
      id: 'order',
      name: 'Order',
      template: (item) => item.order,
    },
    {
      id: 'hidden',
      name: 'Hidden',
      template: (item) => item.is_hidden ? 'Yes' : 'No'
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
            onClick={() => handleDelete(item.account_group_id)}
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
        <h1 className="text-3xl font-bold">Account Groups</h1>
        <Button view="action" onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account Group
        </Button>
      </div>

      <Table
        columns={columns}
        data={accountGroups}
        getRowDescriptor={(item) => ({ id: String(item.account_group_id) })}
        className="compact-table"
      />

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}>
        <Dialog.Header caption="Create Account Group" />
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
              <label className="block text-sm font-medium mb-1">Order</label>
              <TextInput 
                type="number"
                value={String(formData.order)} 
                onUpdate={(val) => setFormData({ ...formData, order: parseInt(val, 10) || 0 })} 
              />
            </div>
            <div>
              <Checkbox 
                checked={formData.is_hidden} 
                onUpdate={(checked) => setFormData({ ...formData, is_hidden: checked })}
              >
                Hidden
              </Checkbox>
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer 
          preset="default"
          onClickButtonCancel={() => setIsCreateModalOpen(false)}
          onClickButtonApply={handleCreate}
          textButtonApply="Create"
          textButtonCancel="Cancel"
        />
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)}>
        <Dialog.Header caption="Edit Account Group" />
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
              <label className="block text-sm font-medium mb-1">Order</label>
              <TextInput 
                type="number"
                value={String(formData.order)} 
                onUpdate={(val) => setFormData({ ...formData, order: parseInt(val, 10) || 0 })} 
              />
            </div>
            <div>
              <Checkbox 
                checked={formData.is_hidden} 
                onUpdate={(checked) => setFormData({ ...formData, is_hidden: checked })}
              >
                Hidden
              </Checkbox>
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer 
          preset="default"
          onClickButtonCancel={() => setIsEditModalOpen(false)}
          onClickButtonApply={handleEdit}
          textButtonApply="Update"
          textButtonCancel="Cancel"
        />
      </Dialog>
    </div>
  );
};
