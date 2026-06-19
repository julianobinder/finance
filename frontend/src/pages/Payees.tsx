import React, { useState, useEffect } from 'react';
import { Button, Dialog, TextInput, TextArea, TableColumnConfig } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Edit, Trash2, Building2 } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';

interface Payee {
  payee_id: number;
  name: string;
  comment?: string;
}

export const Payees: React.FC = () => {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState<Payee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({ name: '', comment: '' });

  useEffect(() => {
    fetchPayees();
  }, []);

  const fetchPayees = async () => {
    try {
      const response = await fetch('/api/accounts/payees/');
      if (response.ok) {
        const data = await response.json();
        setPayees(data.results || data);
      }
    } catch (error) {
      console.error('Failed to fetch payees:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!formData.name) {
      showError('Please input the payee_id name!');
      return;
    }

    try {
      const url = editingPayee
        ? `/api/accounts/payees/${editingPayee.payee_id}/`
        : '/api/accounts/payees/';
      const method = editingPayee ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        showSuccess(editingPayee ? 'Payee updated successfully' : 'Payee created successfully');
        handleCloseModal();
        await fetchPayees();
      } else {
        const errorData = await response.json();
        showError('Failed to save payee_id', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to save payee_id', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleEdit = (payee_id: Payee) => {
    setEditingPayee(payee_id);
    setFormData({
      name: payee_id.name,
      comment: payee_id.comment || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Payee',
      'Are you sure you want to delete this payee_id?'
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/accounts/payees/${id}/`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showSuccess('Payee deleted successfully');
        await fetchPayees();
      } else {
        showError('Failed to delete payee_id');
      }
    } catch (error) {
      console.error('Failed to delete payee_id:', error);
      showError('Failed to delete payee_id', error instanceof Error ? error.message : 'Unknown error');
    }
  };
  
  const handleAddNew = () => {
    setEditingPayee(null);
    setFormData({ name: '', comment: '' });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPayee(null);
    setFormData({ name: '', comment: '' });
  };

  const columns: TableColumnConfig<Payee>[] = [
    {
      id: 'payee_id',
      name: 'ID',
      template: (item) => (
        <div className="flex items-center space-x-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{item.payee_id}</span>
        </div>
      )
    },
    {
      id: 'name',
      name: 'Name',
      template: (item) => <span className="font-medium">{item.name}</span>
    },
    {
      id: 'comment',
      name: 'Comment',
      template: (item) => <span className="text-sm text-muted-foreground">{item.comment || '-'}</span>
    },
    {
      id: 'actions',
      name: 'Actions',
      template: (item) => (
        <div className="flex items-center space-x-1">
          <Button view="flat" onClick={() => handleEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button view="flat-danger" onClick={() => handleDelete(item.payee_id)}>
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
        <h1 className="text-2xl font-bold">Payees</h1>
        <Button view="action" onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Payee
        </Button>
      </div>

      <Dialog open={isModalOpen} onClose={handleCloseModal}>
        <Dialog.Header caption={editingPayee ? 'Edit Payee' : 'Add Payee'} />
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
              <label className="block text-sm font-medium mb-1">Comment</label>
              <TextArea 
                value={formData.comment} 
                onUpdate={(val) => setFormData({ ...formData, comment: val })} 
                minRows={3}
              />
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer 
          preset="default"
          onClickButtonCancel={handleCloseModal}
          onClickButtonApply={handleFinish}
          textButtonApply={editingPayee ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>

      <Table
        columns={columns}
        data={payees}
        getRowDescriptor={(item) => ({ id: String(item.payee_id) })}
        className="compact-table"
      />
    </div>
  );
};