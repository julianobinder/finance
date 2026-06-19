import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Button, Dialog, TextInput, TableColumnConfig } from '@gravity-ui/uikit';
import { Table } from '@/components/ui/gravity-table';
import { Plus, Edit, Trash2, UserCheck } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';

interface Titular {
  titular_id: number;
  name: string;
}

export const Titulars: React.FC = () => {
  const [titulars, setTitulars] = useState<Titular[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTitular, setEditingTitular] = useState<Titular | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({ name: '' });

  useEffect(() => {
    fetchTitulars();
  }, []);

  const fetchTitulars = async () => {
    try {
      const response = await fetch('/api/accounts/titulars/');
      if (response.ok) {
        const data = await response.json();
        setTitulars(data.results || data);
      }
    } catch (error) {
      console.error('Failed to fetch titulars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!formData.name) {
      showError('Please input the titular_id name!');
      return;
    }

    try {
      const url = editingTitular
        ? `/api/accounts/titulars/${editingTitular.titular_id}/`
        : '/api/accounts/titulars/';
      const method = editingTitular ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        showSuccess(editingTitular ? 'Titular updated successfully' : 'Titular created successfully');
        flushSync(() => {
          handleCloseModal();
        });
        await fetchTitulars();
      } else {
        const errorData = await response.json();
        showError('Failed to save titular_id', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to save titular_id', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleEdit = (titular_id: Titular) => {
    setEditingTitular(titular_id);
    setFormData({
      name: titular_id.name
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Titular',
      'Are you sure you want to delete this titular_id?'
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/accounts/titulars/${id}/`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showSuccess('Titular deleted successfully');
        await fetchTitulars();
      } else {
        showError('Failed to delete titular_id');
      }
    } catch (error) {
      console.error('Failed to delete titular_id:', error);
      showError('Failed to delete titular_id', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleAddNew = () => {
    setEditingTitular(null);
    setFormData({ name: '' });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTitular(null);
    setFormData({ name: '' });
  };

  const columns: TableColumnConfig<Titular>[] = [
    {
      id: 'titular_id',
      name: 'ID',
      template: (item) => (
        <div className="flex items-center space-x-2">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{item.titular_id}</span>
        </div>
      )
    },
    {
      id: 'name',
      name: 'Name',
      template: (item) => <span className="font-medium">{item.name}</span>
    },
    {
      id: 'actions',
      name: 'Actions',
      template: (item) => (
        <div className="flex items-center space-x-1">
          <Button view="flat" onClick={() => handleEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button view="flat-danger" onClick={() => handleDelete(item.titular_id)}>
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
        <h1 className="text-2xl font-bold">Titulars</h1>
        <Button view="action" onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Titular
        </Button>
      </div>

      <Dialog open={isModalOpen} onClose={handleCloseModal}>
        <Dialog.Header caption={editingTitular ? 'Edit Titular' : 'Add Titular'} />
        <Dialog.Body>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <TextInput 
                value={formData.name} 
                onUpdate={(val) => setFormData({ ...formData, name: val })} 
              />
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer 
          preset="default"
          onClickButtonCancel={handleCloseModal}
          onClickButtonApply={handleFinish}
          textButtonApply={editingTitular ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>

      <Table
        columns={columns}
        data={titulars}
        getRowDescriptor={(item) => ({ id: String(item.titular_id) })}
        className="compact-table"
      />
    </div>
  );
};