import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button, Dialog, TextInput, Checkbox } from '@gravity-ui/uikit';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Edit2, Trash2, GitMerge } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete, showConfirm } from '@/utils/notifications';

type Category = {
  category_id: number;
  name: string;
  parent_category_id: number | null;
  is_hidden: boolean;
};

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSubCategory, setIsSubCategory] = useState(false);
  const [targetParentId, setTargetParentId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({ name: '', is_hidden: false });
  const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({});
  const [dragOverParentId, setDragOverParentId] = useState<number | null>(null);
  const [mergeSource, setMergeSource] = useState<Category | null>(null);

  const handleMerge = async (target: Category) => {
    if (!mergeSource) return;

    const confirmed = await showConfirm({
      title: 'Confirm Sub-category Merge',
      content: `Are you sure you want to merge all transactions from "${mergeSource.name}" into "${target.name}"? "${mergeSource.name}" will be permanently deleted. This action cannot be undone.`,
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`${API}${mergeSource.category_id}/merge/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_category_id: target.category_id,
        }),
      });

      if (response.ok) {
        showSuccess(`Successfully merged "${mergeSource.name}" into "${target.name}"`);
        setMergeSource(null);
        await fetchAllCategories();
      } else {
        const err = await response.json();
        showError('Failed to merge sub-categories', typeof err === 'string' ? err : JSON.stringify(err));
      }
    } catch (error) {
      showError('Failed to merge sub-categories', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDragStart = (e: React.DragEvent, subId: number) => {
    e.dataTransfer.setData('text/plain', String(subId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, parentId: number) => {
    e.preventDefault();
    if (dragOverParentId !== parentId) {
      setDragOverParentId(parentId);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetParent: Category) => {
    e.preventDefault();
    setDragOverParentId(null);
    const subIdStr = e.dataTransfer.getData('text/plain');
    if (!subIdStr) return;
    const subId = Number(subIdStr);
    const sub = categories.find((c) => c.category_id === subId);
    if (!sub) return;

    if (sub.parent_category_id === targetParent.category_id) return;
    if (sub.category_id === targetParent.category_id) return;

    try {
      const response = await fetch(`${API}${sub.category_id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sub.name,
          parent_category_id: targetParent.category_id,
          is_hidden: sub.is_hidden,
        }),
      });

      if (response.ok) {
        showSuccess(`Moved sub-category "${sub.name}" to "${targetParent.name}"`);
        await fetchAllCategories();
      } else {
        const err = await response.json();
        showError('Failed to move sub-category', typeof err === 'string' ? err : JSON.stringify(err));
      }
    } catch (error) {
      showError('Failed to move sub-category', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const API = '/api/accounts/categories/';

  const fetchAllCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      if (!res.ok) {
        throw new Error(`Failed to fetch categories: ${res.statusText}`);
      }
      const data = await res.json();
      setCategories(data.results || data);
    } catch (error) {
      showError('Failed to load categories', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllCategories();
  }, []);

  const { rootCategories, subCategoriesMap } = useMemo(() => {
    const roots = categories.filter((c) => c.parent_category_id === null);
    const subMap: Record<number, Category[]> = {};
    categories.forEach((c) => {
      if (c.parent_category_id !== null) {
        if (!subMap[c.parent_category_id]) {
          subMap[c.parent_category_id] = [];
        }
        subMap[c.parent_category_id].push(c);
      }
    });

    roots.sort((a, b) => a.name.localeCompare(b.name));
    Object.keys(subMap).forEach((key) => {
      subMap[Number(key)].sort((a, b) => a.name.localeCompare(b.name));
    });

    return { rootCategories: roots, subCategoriesMap: subMap };
  }, [categories]);

  const toggleParent = (pId: number) => {
    setExpandedParents((prev) => ({ ...prev, [pId]: !prev[pId] }));
  };

  const expandAll = () => {
    const updated: Record<number, boolean> = {};
    rootCategories.forEach((c) => {
      updated[c.category_id] = true;
    });
    setExpandedParents(updated);
  };

  const collapseAll = () => {
    setExpandedParents({});
  };

  const isParentExpanded = (parentId: number) => {
    return !!expandedParents[parentId];
  };

  const filteredTree = useMemo(() => {
    return rootCategories.map((parent) => ({
      parent,
      subCategories: subCategoriesMap[parent.category_id] || [],
    }));
  }, [rootCategories, subCategoriesMap]);

  const openModal = (category: Category | null, isSub: boolean) => {
    setEditingCategory(category);
    setIsSubCategory(isSub);
    if (category) {
      setFormData({
        name: category.name,
        is_hidden: category.is_hidden,
      });
      if (isSub) {
        setTargetParentId(category.parent_category_id);
      } else {
        setTargetParentId(null);
      }
    } else {
      setFormData({ name: '', is_hidden: false });
      if (!isSub) {
        setTargetParentId(null);
      }
    }
    setIsModalOpen(true);
  };

  const openNewSubCategoryModal = (parentId: number) => {
    setTargetParentId(parentId);
    openModal(null, true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setTargetParentId(null);
    setFormData({ name: '', is_hidden: false });
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      showError('Please input a name!');
      return;
    }

    const isEditing = !!editingCategory;
    const parentId = isSubCategory ? targetParentId : null;
    const url = isEditing ? `${API}${editingCategory.category_id}/` : API;
    const method = isEditing ? 'PUT' : 'POST';

    const payload = {
      ...formData,
      parent_category_id: parentId,
      is_hidden: formData.is_hidden ?? false,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        flushSync(() => {
          handleCancel();
        });
        showSuccess(`Category ${isEditing ? 'updated' : 'created'} successfully`);
        await fetchAllCategories();
      } else {
        const errorData = await response.json();
        showError(`Failed to ${isEditing ? 'update' : 'create'} category`, typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
      }
    } catch (error) {
      showError(`Failed to ${isEditing ? 'update' : 'create'} category`, error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDelete = async (cat: Category) => {
    const isParent = !cat.parent_category_id;
    const confirmed = await showConfirmDelete(
      `Delete ${isParent ? 'Category' : 'Sub-category'}`,
      `Are you sure you want to delete this ${isParent ? 'category and its sub-categories' : 'sub-category'}?`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`${API}${cat.category_id}/`, { method: 'DELETE' });
      if (response.ok) {
        showSuccess('Category deleted successfully');
        if (selectedParentId === cat.category_id) {
          setSelectedParentId(null);
        }
        await fetchAllCategories();
      } else {
        showError('Failed to delete category');
      }
    } catch (error) {
      showError('Failed to delete category', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const modalTitle = `${editingCategory ? 'Edit' : 'New'} ${isSubCategory ? 'Sub-category' : 'Category'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Categories</h1>
          <p className="text-muted-foreground text-sm">TreeView based hierarchy for categories and sub-categories.</p>
        </div>
      </div>

      {mergeSource && (
        <div className="flex items-center justify-between p-4 bg-yellow-500/10 border border-yellow-500/35 rounded-lg backdrop-blur-sm animate-pulse">
          <div className="flex items-center space-x-3">
            <GitMerge className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <div>
              <p className="font-semibold text-yellow-800 dark:text-yellow-250">Merge Mode Active</p>
              <p className="text-sm text-yellow-700/80 dark:text-yellow-350/80">
                Merging transactions from <strong>"{mergeSource.name}"</strong>. Click <strong>"Merge Into"</strong> on another sub-category to choose the target.
              </p>
            </div>
          </div>
          <Button view="normal" onClick={() => setMergeSource(null)}>
            Cancel Merge
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button view="action" disabled={!!mergeSource} onClick={() => openModal(null, false)}>
          <Plus className="mr-2 h-4 w-4" />
          New Category
        </Button>
        <Button onClick={expandAll}>Expand All</Button>
        <Button onClick={collapseAll}>Collapse All</Button>
      </div>

      <div className="compact-table border border-border rounded-lg overflow-hidden bg-card shadow-sm">
        <table 
          className="w-full border-collapse text-left"
          onDragLeave={() => setDragOverParentId(null)}
        >
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="py-1 px-3 text-base font-bold text-black w-16 text-center">Type</th>
              <th className="py-1 px-3 text-base font-bold text-black w-24">ID</th>
              <th className="py-1 px-3 text-base font-bold text-black">Name</th>
              <th className="py-1 px-3 text-base font-bold text-black w-28 text-center">Hidden</th>
              <th className="py-1 px-3 text-base font-bold text-black w-40 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading categories...
                </td>
              </tr>
            ) : filteredTree.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No categories found.
                </td>
              </tr>
            ) : (
              filteredTree.map(({ parent, subCategories }) => {
                const isExpanded = isParentExpanded(parent.category_id);
                const hasSubs = subCategories.length > 0;
                const isSelected = selectedParentId === parent.category_id;

                return (
                  <React.Fragment key={parent.category_id}>
                    {/* Parent Row */}
                    <tr 
                      className={`g-table__row border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${
                        isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''
                      } ${
                        dragOverParentId === parent.category_id ? 'drag-over-row' : ''
                      }`}
                      onClick={() => {
                        setSelectedParentId(parent.category_id);
                        setExpandedParents((prev) => ({ ...prev, [parent.category_id]: true }));
                      }}
                      onDragOver={(e) => handleDragOver(e, parent.category_id)}
                      onDrop={(e) => handleDrop(e, parent)}
                    >
                      <td className="py-1 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {hasSubs ? (
                            <div 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                toggleParent(parent.category_id); 
                              }}
                              className="p-1 hover:bg-muted rounded cursor-pointer text-muted-foreground inline-flex items-center"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </div>
                          ) : (
                            <div className="w-6 h-6" />
                          )}
                          {isExpanded ? (
                            <FolderOpen className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <Folder className="h-4 w-4 text-green-600 shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-3 font-mono text-xs text-muted-foreground">{parent.category_id}</td>
                      <td className="py-1 px-3">
                        <span className="font-semibold text-foreground text-sm">{parent.name}</span>
                      </td>
                      <td className="py-1 px-3 text-center text-sm">
                        {parent.is_hidden ? (
                          <span className="text-red-500 font-medium">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="py-1 px-3">
                        <div className="flex justify-center space-x-1 min-h-[28px]">
                          {!mergeSource && (
                            <>
                              <Button 
                                view="flat" 
                                className="add-sub-btn"
                                title="Add Sub-category" 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  openNewSubCategoryModal(parent.category_id); 
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button 
                                view="flat" 
                                className="edit-btn"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  openModal(parent, false); 
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button 
                                view="flat-danger" 
                                className="delete-btn"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  handleDelete(parent); 
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Subcategories (Children) */}
                    {isExpanded && subCategories.map((sub) => {
                      return (
                        <tr 
                          key={sub.category_id}
                          className="g-table__row border-b border-border/30 hover:bg-muted/10 transition-colors bg-muted/5 cursor-grab active:cursor-grabbing"
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, sub.category_id)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (dragOverParentId !== null) setDragOverParentId(null);
                          }}
                          onDragEnd={() => setDragOverParentId(null)}
                        >
                          <td className="py-1 px-3 text-center">
                            <div className="flex items-center justify-center">
                              <Folder className="h-4 w-4 text-amber-600 shrink-0" />
                            </div>
                          </td>
                          <td className="py-1 px-3 font-mono text-xs text-muted-foreground pl-4">{sub.category_id}</td>
                          <td className="py-1 px-3">
                            <div className="flex items-center pl-4">
                              <div className="w-4 h-5 border-l border-b border-border/80 -mt-2.5 mr-2 rounded-bl-md shrink-0" />
                              <span className="text-foreground/90 font-medium text-sm">{sub.name}</span>
                            </div>
                          </td>
                          <td className="py-1 px-3 text-center text-sm">
                            {sub.is_hidden ? (
                              <span className="text-red-500 font-medium">Yes</span>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </td>
                          <td className="py-1 px-3">
                            <div className="flex justify-center space-x-1 items-center min-h-[28px]">
                              {mergeSource ? (
                                sub.category_id === mergeSource.category_id ? (
                                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                    Source
                                  </span>
                                ) : (
                                  <Button 
                                    view="flat" 
                                    className="merge-target-btn"
                                    title="Merge Into"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      handleMerge(sub); 
                                    }}
                                  >
                                    <GitMerge className="h-4 w-4 text-green-600" />
                                  </Button>
                                )
                              ) : (
                                <>
                                  <Button 
                                    view="flat" 
                                    className="merge-btn"
                                    title="Merge sub-category"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setMergeSource(sub); 
                                    }}
                                  >
                                    <GitMerge className="h-4 w-4 text-blue-600" />
                                  </Button>
                                  <Button 
                                    view="flat" 
                                    className="edit-btn"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      openModal(sub, true); 
                                    }}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    view="flat-danger" 
                                    className="delete-btn"
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      handleDelete(sub); 
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isModalOpen} onClose={handleCancel}>
        <Dialog.Header caption={modalTitle} />
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
          onClickButtonCancel={handleCancel}
          onClickButtonApply={handleSubmit}
          textButtonApply={editingCategory ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>
    </div>
  );
}
