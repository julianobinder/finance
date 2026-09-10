import React, { useState, useEffect } from 'react';
import { Button, Dialog, TextInput, TextArea } from '@gravity-ui/uikit';
import { Plus, Edit, Trash2, Building2, GitMerge, Undo2, Eye, EyeOff } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete, showConfirm } from '@/utils/notifications';

interface Payee {
  payee_id: number;
  name: string;
  comment?: string;
  merged_into_payee_id: number | null;
  merged_into_payee_name: string | null;
  related_count: number;
}

const API = '/api/accounts/payees/';

export const Payees: React.FC = () => {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState<Payee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mergeSource, setMergeSource] = useState<Payee | null>(null);
  const [showAliases, setShowAliases] = useState(false);

  const [formData, setFormData] = useState({ name: '', comment: '' });

  useEffect(() => {
    fetchPayees();
  }, []);

  const fetchPayees = async () => {
    try {
      const response = await fetch(API);
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
      showError('Please enter a payee name');
      return;
    }

    try {
      const url = editingPayee ? `${API}${editingPayee.payee_id}/` : API;
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
        showError('Failed to save payee', typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError('Failed to save payee', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleEdit = (payee: Payee) => {
    setEditingPayee(payee);
    setFormData({
      name: payee.name,
      comment: payee.comment || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirmDelete(
      'Delete Payee',
      'Are you sure you want to delete this payee?'
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`${API}${id}/`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showSuccess('Payee deleted successfully');
        await fetchPayees();
      } else {
        showError('Failed to delete payee');
      }
    } catch (error) {
      console.error('Failed to delete payee:', error);
      showError('Failed to delete payee', error instanceof Error ? error.message : 'Unknown error');
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

  const handleMerge = async (target: Payee) => {
    if (!mergeSource) return;

    const confirmed = await showConfirm({
      title: 'Confirm Payee Merge',
      content: `Mark "${mergeSource.name}" as an alias of "${target.name}"? "${mergeSource.name}" is kept (not deleted) so imports and AI suggestions can keep matching that exact bank-statement spelling, but new transactions and reports will roll up under "${target.name}". You can undo this anytime.`,
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`${API}${mergeSource.payee_id}/merge/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination_payee_id: target.payee_id }),
      });

      if (response.ok) {
        showSuccess(`"${mergeSource.name}" now maps to "${target.name}"`);
        setMergeSource(null);
        await fetchPayees();
      } else {
        const err = await response.json();
        showError('Failed to merge payees', typeof err === 'string' ? err : (err.detail || JSON.stringify(err)));
      }
    } catch (error) {
      showError('Failed to merge payees', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUnmerge = async (payee: Payee) => {
    const confirmed = await showConfirm({
      title: 'Undo Merge',
      content: `Detach "${payee.name}" from "${payee.merged_into_payee_name}"? It will become a standalone payee again.`,
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`${API}${payee.payee_id}/unmerge/`, { method: 'POST' });
      if (response.ok) {
        showSuccess(`"${payee.name}" is standalone again`);
        await fetchPayees();
      } else {
        showError('Failed to undo merge');
      }
    } catch (error) {
      showError('Failed to undo merge', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // Group aliases directly beneath their canonical payee for display; any
  // standalone payee (never merged) just appears on its own. Aliases are
  // collapsed by default (toggle via "Show Aliases") so the list isn't
  // cluttered with old bank-statement spellings kept only for import-rule/AI
  // matching, not day-to-day use.
  const canonicalPayees = payees.filter(p => !p.merged_into_payee_id);
  const aliasPayees = payees.filter(p => !!p.merged_into_payee_id);
  const orderedPayees: Payee[] = [];
  for (const canonical of canonicalPayees) {
    orderedPayees.push(canonical);
    if (showAliases) {
      for (const alias of aliasPayees.filter(p => p.merged_into_payee_id === canonical.payee_id)) {
        orderedPayees.push(alias);
      }
    }
  }

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Payees</h1>
          <p className="text-muted-foreground text-sm">
            Merge lets you treat different bank-statement spellings of the same real-world payee (e.g. "COEMI IMOB" vs "COEMI SERVICOS IMOBILIARIOS") as one — the original names are kept, not deleted, so imports and AI suggestions can still match them.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAliases((v) => !v)}>
            {showAliases ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {showAliases ? 'Hide' : 'Show'} Aliases{aliasPayees.length > 0 ? ` (${aliasPayees.length})` : ''}
          </Button>
          <Button view="action" disabled={!!mergeSource} onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add Payee
          </Button>
        </div>
      </div>

      {mergeSource && (
        <div className="flex items-center justify-between p-4 bg-yellow-500/10 border border-yellow-500/35 rounded-lg backdrop-blur-sm">
          <div className="flex items-center space-x-3">
            <GitMerge className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <div>
              <p className="font-semibold text-yellow-800 dark:text-yellow-250">Merge Mode Active</p>
              <p className="text-sm text-yellow-700/80 dark:text-yellow-350/80">
                Aliasing <strong>"{mergeSource.name}"</strong>. Click <strong>"Merge Into"</strong> on the payee it should map to.
              </p>
            </div>
          </div>
          <Button view="normal" onClick={() => setMergeSource(null)}>
            Cancel Merge
          </Button>
        </div>
      )}

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

      <div className="compact-table border border-border rounded-lg overflow-hidden bg-card shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="py-1 px-3 text-sm font-bold w-16">ID</th>
              <th className="py-1 px-3 text-sm font-bold">Name</th>
              <th className="py-1 px-3 text-sm font-bold">Comment</th>
              <th className="py-1 px-3 text-sm font-bold w-28 text-center" title="Transactions, import rules, and aliases referencing this payee — delete is blocked until this reaches 0">Related</th>
              <th className="py-1 px-3 text-sm font-bold w-40 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orderedPayees.map((payee, idx) => {
              const isAlias = !!payee.merged_into_payee_id;
              return (
                <tr
                  key={payee.payee_id}
                  className={`border-b border-border last:border-0 ${idx % 2 === 1 ? 'bg-muted/40' : ''}`}
                  style={{ opacity: isAlias ? 0.7 : 1 }}
                >
                  <td className="py-1 px-3">
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{payee.payee_id}</span>
                    </div>
                  </td>
                  <td className="py-1 px-3">
                    <span className={isAlias ? 'text-sm' : 'font-medium'}>
                      {isAlias && <span className="text-muted-foreground mr-1">↳</span>}
                      {payee.name}
                    </span>
                    {isAlias && (
                      <span className="text-xs text-muted-foreground ml-2">→ {payee.merged_into_payee_name}</span>
                    )}
                  </td>
                  <td className="py-1 px-3">
                    <span className="text-sm text-muted-foreground">{payee.comment || '-'}</span>
                  </td>
                  <td className="py-1 px-3 text-center">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        payee.related_count === 0
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      title={payee.related_count === 0 ? 'No related records — safe to delete' : `${payee.related_count} related record(s) — delete is blocked until this reaches 0`}
                    >
                      {payee.related_count}
                    </span>
                  </td>
                  <td className="py-1 px-3">
                    <div className="flex justify-center items-center space-x-1 min-h-[28px]">
                      {mergeSource ? (
                        payee.payee_id === mergeSource.payee_id ? (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                            Source
                          </span>
                        ) : (
                          <Button
                            view="flat"
                            title="Merge Into"
                            onClick={(e) => { e.stopPropagation(); handleMerge(payee); }}
                          >
                            <GitMerge className="h-4 w-4 text-green-600" />
                          </Button>
                        )
                      ) : (
                        <>
                          {isAlias ? (
                            <Button
                              view="flat"
                              title="Undo merge"
                              onClick={(e) => { e.stopPropagation(); handleUnmerge(payee); }}
                            >
                              <Undo2 className="h-4 w-4 text-amber-600" />
                            </Button>
                          ) : (
                            <Button
                              view="flat"
                              title="Merge into another payee"
                              onClick={(e) => { e.stopPropagation(); setMergeSource(payee); }}
                            >
                              <GitMerge className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          <Button view="flat" onClick={() => handleEdit(payee)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button view="flat-danger" onClick={() => handleDelete(payee.payee_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {orderedPayees.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No payees yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
