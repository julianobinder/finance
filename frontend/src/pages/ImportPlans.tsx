import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select as GravitySelect, Dialog as GravityDialog } from '@gravity-ui/uikit';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Edit, Trash2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '@/services/api';
import { ImportPlan, ImportPlanRule, Account, Payee, Category } from '@/types';
import { showError, showWarning, showSuccess, showConfirmDelete } from '@/utils/notifications';

// Sortable Row Component for Rules
interface SortableRuleRowProps {
  rule: ImportPlanRule;
  plan: ImportPlan;
  onEdit: (plan: ImportPlan, rule: ImportPlanRule) => void;
  onDelete: (rule: ImportPlanRule) => void;
}

const SortableRuleRow: React.FC<SortableRuleRowProps> = ({ rule, plan, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.import_plan_rule_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr 
      ref={setNodeRef} 
      style={style}
      data-testid={`rule-row-${rule.import_plan_rule_id}`}
      className="border-b"
    >
      <td className="px-2 py-1">
        <div className="flex items-center space-x-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4 text-gray-400" />
          </button>
          <span className="text-sm text-gray-500">{rule.order || 0}</span>
        </div>
      </td>
      <td className="px-2 py-1">{rule.import_csv_field_name}</td>
      <td className="px-2 py-1">{rule.pattern}</td>
      <td className="px-2 py-1">{rule.ignore ? 'Yes' : 'No'}</td>
      <td className="px-2 py-1">{rule.payee_name || '-'}</td>
      <td className="px-2 py-1">
        {rule.category_name ? (
          rule.category_name.includes(': ') ? (
            <>
              {rule.category_name.split(': ')[0]}: <strong>{rule.category_name.split(': ')[1]}</strong>
            </>
          ) : (
            rule.category_name
          )
        ) : (
          '-'
        )}
      </td>
      <td className="px-2 py-1">{rule.to_account_name || '-'}</td>
      <td className="px-2 py-1">
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(plan, rule)}
            className="h-8 w-8 p-0"
            title="Edit Rule"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(rule)}
            className="h-8 w-8 p-0"
            title="Delete Rule"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
};

const ImportPlansNew: React.FC = () => {
  const [importPlans, setImportPlans] = useState<ImportPlan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<Category[]>([]);
  const [csvTemplates, setCsvTemplates] = useState<any[]>([]);
  const [csvFields, setCsvFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ImportPlan | null>(null);
  // No template filter; we show all plans
  const [selectedPlan, setSelectedPlan] = useState<ImportPlan | null>(null);
  const [selectedRule, setSelectedRule] = useState<ImportPlanRule | null>(null);
  const [payeeFilter, setPayeeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('');

  const resolvePayeeId = async (payeeIdValue: string): Promise<number | null> => {
    if (!payeeIdValue) return null;
    const isNumeric = /^\d+$/.test(payeeIdValue);
    if (isNumeric) {
      return parseInt(payeeIdValue, 10);
    }
    try {
      const response = await api.post('/accounts/payees/', { name: payeeIdValue });
      const newPayee = response.data;
      setPayees((prev) => [...prev, newPayee]);
      return newPayee.payee_id;
    } catch (e) {
      showError('Could not create new payee');
      throw e;
    }
  };

  const resolveCategoryId = async (categoryIdValue: string, parentCategoryId: number | null): Promise<number | null> => {
    if (!categoryIdValue) return null;
    const isNumeric = /^\d+$/.test(categoryIdValue);
    if (isNumeric) {
      return parseInt(categoryIdValue, 10);
    }
    try {
      const payload = {
        name: categoryIdValue,
        parent_category_id: parentCategoryId || null,
        is_hidden: false,
        order: 0
      };
      const response = await api.post('/accounts/categories/', payload);
      const newCategory = response.data;
      setAllCategories((prev) => [...prev, newCategory]);
      if (parentCategoryId) {
        setSubCategories((prev) => [...prev, newCategory]);
      } else {
        setCategories((prev) => [...prev, newCategory]);
      }
      return newCategory.category_id;
    } catch (e) {
      showError('Could not create new category');
      throw e;
    }
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Form state for Import Plan
  const [planFormData, setPlanFormData] = useState({
    name: '',
    account: '',
    importcsv: ''
  });

  // Form state for Import Plan Rule
  const [ruleFormData, setRuleFormData] = useState({
    importcsvfield: '',
    match_type: 'contains' as 'contains' | 'equals',
    pattern: '',
    ignore: false,
    use_payee: false,
    payee_id: '',
    use_category: false,
    category_id: '',
    subcategory: '',
    use_to_account: false,
    to_account: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (ruleFormData.category_id) {
      loadSubCategories(parseInt(ruleFormData.category_id));
    }
  }, [ruleFormData.category_id]);

  const loadData = async () => {
    try {
      const [accountsRes, payeesRes, templatesRes] = await Promise.all([
        api.get('/accounts/'),
        api.get('/accounts/payees/'),
        api.get('/accounts/csv-templates/')
      ]);

      setAccounts(accountsRes.data.results);
      setPayees(payeesRes.data.results);
      // Always use lookup-data to get the full unpaginated category_id list
      try {
        const lookup = await api.get('/transactions/lookup-data/');
        const cats = lookup.data?.categories ?? [];
        setAllCategories(cats);
        setCategories(cats.filter((cat: Category) => cat.parent_category_id == null));
      } catch (e) {
        console.error('Categories load from lookup-data failed:', e);
        setAllCategories([]);
        setCategories([]);
      }
      setCsvTemplates(templatesRes.data.results);
      await loadAllImportPlans();
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  const ensureCategoriesLoaded = async (): Promise<Category[]> => {
    if ((allCategories || []).length > 0) {
      return allCategories;
    }
    try {
      const lookup = await api.get('/transactions/lookup-data/');
      const cats = lookup.data?.categories ?? [];
      setAllCategories(cats);
      setCategories(cats.filter((cat: Category) => cat.parent_category_id == null));
      return cats;
    } catch {}
    try {
      const res = await api.get('/accounts/categories/');
      const payload = res.data?.results ?? res.data ?? [];
      if (Array.isArray(payload)) {
        setAllCategories(payload);
        setCategories(payload.filter((cat: Category) => cat.parent_category_id == null));
        return payload;
      }
    } catch {}
    return [];
  };

  const loadAllImportPlans = async (): Promise<ImportPlan[]> => {
    try {
      const response = await api.get('/accounts/import-plans/');
      const plans = response.data.results || response.data;
      setImportPlans(plans);
      return plans;
    } catch (error) {
      console.error('Error loading import plans:', error);
      return [];
    }
  };

  const loadCsvFields = async (templateId: number) => {
    try {
      const response = await api.get(`/accounts/import-plans/fields/${templateId}/`);
      setCsvFields(response.data);
    } catch (error) {
      console.error('Error loading CSV fields:', error);
    }
  };

  const loadSubCategories = async (categoryId: number) => {
    try {
      // Prefer API client with same endpoint convention as Transaction modal
      const response = await api.get(`/transactions/categories/${categoryId}/subcategories/`);
      const data = response.data?.results ?? response.data ?? [];
      setSubCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading subcategories:', error);
      // Fallback to local filter
      try {
        const subCats = (allCategories || []).filter((cat: any) => cat.parent_category_id === categoryId);
        setSubCategories(subCats);
      } catch {}
    }
  };

  // No template selection; fields are loaded when creating/editing a rule based on the plan's template

  const handleCreateNewPlan = () => {
    setEditingPlan(null);
    setPlanFormData({ name: '', account: '', importcsv: '' });
    setIsModalOpen(true);
  };

  const handleEditPlan = (plan: ImportPlan) => {
    setSelectedPlan(null);
    setSelectedRule(null);
    setEditingPlan(plan);
    setPlanFormData({
      name: plan.name || '',
      account: plan.account_id ? String(plan.account_id) : '',
      importcsv: plan.import_csv_id ? String(plan.import_csv_id) : ''
    });
    setIsModalOpen(true);
  };

  const handleCreateNewRule = async (plan: ImportPlan) => {
    setSelectedPlan(plan);
    setSelectedRule(null);
    setPayeeFilter('');
    setCategoryFilter('');
    setSubcategoryFilter('');
    setRuleFormData({
      importcsvfield: '',
      match_type: 'contains',
      pattern: '',
      ignore: false,
      use_payee: false,
      payee_id: '',
      use_category: false,
      category_id: '',
      subcategory: '',
      use_to_account: false,
      to_account: ''
    });
    try {
      await loadCsvFields(plan.import_csv_id);
    } catch {}
    setIsRuleModalOpen(true);
  };

  const handleEditRule = async (plan: ImportPlan, rule: ImportPlanRule) => {
    setSelectedPlan(plan);
    setSelectedRule(rule);
    setPayeeFilter('');
    setCategoryFilter('');
    setSubcategoryFilter('');
    
    // Ensure payee_id is loaded if rule has one
    const existingPayeeId = (rule as any).payee_id ? Number((rule as any).payee_id) : undefined;
    if (existingPayeeId) {
      const payeeExists = payees.find(p => p.payee_id === existingPayeeId);
      if (!payeeExists) {
        try {
          const payeeResponse = await api.get(`/accounts/payees/${existingPayeeId}/`);
          const payeeObj = payeeResponse.data;
          setPayees(prev => [...prev, payeeObj]);
        } catch (err) {
          console.error('Failed to fetch payee_id:', err);
        }
      }
    }
    
    // Ensure categories are loaded before deriving parent/child
    let cats = await ensureCategoriesLoaded();
    
    // Derive parent category_id if rule.category_id is a subcategory
    const existingCategoryId = (rule as any).category_id ? Number((rule as any).category_id) : undefined;
    let parentCategoryId: number | undefined = undefined;
    let catObj: Category | undefined = undefined;
    
    if (existingCategoryId) {
      catObj = (cats || []).find((c) => c.category_id === existingCategoryId);
      
      // If category_id not found in cached list, try fetching from API
      if (!catObj) {
        try {
          const catResponse = await api.get(`/accounts/categories/${existingCategoryId}/`);
          catObj = catResponse.data;
          // Add to allCategories cache
          if (catObj) {
            const updatedCats = [...cats, catObj];
            setAllCategories(updatedCats);
            cats = updatedCats;
          }
        } catch (err) {
          console.error('Failed to fetch category_id:', err);
        }
      }
      
      if (catObj && (catObj as any).parent_category_id) {
        parentCategoryId = (catObj as any).parent_category_id as unknown as number;
      }
    }
    const useCategory = !!(rule as any).category_id;
    const nextCategory = parentCategoryId ? String(parentCategoryId) : (existingCategoryId ? String(existingCategoryId) : '');
    const nextSubcategory = parentCategoryId ? String(existingCategoryId) : '';
    
    setRuleFormData({
      importcsvfield: rule.import_csv_field_id ? String(rule.import_csv_field_id) : '',
      match_type: (rule as any).match_type || 'contains',
      pattern: rule.pattern || '',
      ignore: !!rule.ignore,
      use_payee: !!(rule as any).payee_id,
      payee_id: (rule as any).payee_id ? String((rule as any).payee_id) : '',
      use_category: useCategory,
      category_id: nextCategory,
      subcategory: nextSubcategory,
      use_to_account: !!rule.to_account_id,
      to_account: rule.to_account_id ? String(rule.to_account_id) : ''
    });
    try {
      await loadCsvFields(plan.import_csv_id);
      if (parentCategoryId) {
        await loadSubCategories(parentCategoryId);
      } else if (existingCategoryId && !parentCategoryId) {
        // existing rule references a top-level category_id; load its subs for immediate selection
        await loadSubCategories(existingCategoryId);
      }
      // Re-assert selected values after options are loaded to ensure UI reflects selection
      setRuleFormData(prev => ({
        ...prev,
        category_id: nextCategory,
        subcategory: nextSubcategory,
        use_category: useCategory,
      }));
    } catch {}
    setIsRuleModalOpen(true);
  };

  const handleSavePlan = async () => {
    try {
      const basePayload: any = {
        name: planFormData.name,
        account_id: planFormData.account ? parseInt((planFormData as any).account) : undefined,
        import_csv_id: parseInt(planFormData.importcsv), // Always include import_csv_id for both create and edit
      };
      const payload = basePayload;

      if (editingPlan) {
        await api.put(`/accounts/import-plans/${editingPlan.import_plan_id}/`, payload);
      } else {
        await api.post('/accounts/import-plans/', payload);
      }

      await loadAllImportPlans();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving import plan:', error);
    }
  };

  const handleSaveRule = async () => {
    if (!selectedPlan) return;

    try {
      // Validation
      if (!ruleFormData.importcsvfield) {
        showWarning('Missing CSV Field', 'CSV Field is required');
        return;
      }
      if (!ruleFormData.pattern) {
        showWarning('Missing Pattern', 'Pattern is required');
        return;
      }
      // Payee and category_id are not applicable for transfers
      if (!ruleFormData.use_to_account) {
        if (ruleFormData.use_payee && !ruleFormData.payee_id) {
          showWarning('Missing Payee', 'Payee is required when enabled');
          return;
        }
        if (ruleFormData.use_category) {
          if (!ruleFormData.category_id) {
            showWarning('Missing Category', 'Category is required when enabled');
            return;
          }
          if (!ruleFormData.subcategory) {
            showWarning('Missing Subcategory', 'Subcategory is required when category_id is enabled');
            return;
          }
        }
      }
      if (ruleFormData.use_to_account && !ruleFormData.to_account) {
        showWarning('Missing To Account', 'To Account is required when enabled');
        return;
      }

      // Calculate next order number
      const existingRulesCount = (editingPlan?.rules || []).length;
      const nextOrder = existingRulesCount + 1;

      let finalPayeeId: number | null = null;
      if (!ruleFormData.use_to_account && ruleFormData.use_payee && ruleFormData.payee_id) {
        finalPayeeId = await resolvePayeeId(ruleFormData.payee_id);
      }

      let finalCategoryId: number | null = null;
      if (!ruleFormData.use_to_account && ruleFormData.use_category && ruleFormData.category_id) {
        const catId = await resolveCategoryId(ruleFormData.category_id, null);
        if (catId) {
          if (ruleFormData.subcategory) {
            finalCategoryId = await resolveCategoryId(ruleFormData.subcategory, catId);
          } else {
            finalCategoryId = catId;
          }
        }
      }

      const payload = {
        import_plan_id: selectedPlan.import_plan_id,
        import_csv_field_id: parseInt(ruleFormData.importcsvfield),
        pattern: ruleFormData.pattern,
        order: nextOrder,
        ignore: ruleFormData.ignore,
        match_type: ruleFormData.match_type,
        // When to_account is set (transfer), payee_id and category_id must be null
        payee_id: finalPayeeId,
        category_id: finalCategoryId,
        to_account_id: ruleFormData.use_to_account && ruleFormData.to_account ? parseInt(ruleFormData.to_account) : null
      };

      await api.post('/accounts/import-plan-rules/', payload);

      const updatedPlans = await loadAllImportPlans();
      const refreshed = updatedPlans.find(p => p.import_plan_id === (editingPlan?.import_plan_id || selectedPlan.import_plan_id));
      if (refreshed) setEditingPlan(refreshed);
      setIsRuleModalOpen(false);
      setSelectedRule(null);
      setSelectedPlan(null);
    } catch (error) {
      console.error('Error saving import plan rule:', error);
      showError('Failed to save rule', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUpdateRule = async () => {
    if (!selectedPlan || !selectedRule) return;
    try {
      // Validation
      if (!ruleFormData.importcsvfield) {
        showWarning('Missing CSV Field', 'CSV Field is required');
        return;
      }
      if (!ruleFormData.pattern) {
        showWarning('Missing Pattern', 'Pattern is required');
        return;
      }
      // Payee and category_id are not applicable for transfers
      if (!ruleFormData.use_to_account) {
        if (ruleFormData.use_payee && !ruleFormData.payee_id) {
          showWarning('Missing Payee', 'Payee is required when enabled');
          return;
        }
        if (ruleFormData.use_category) {
          if (!ruleFormData.category_id) {
            showWarning('Missing Category', 'Category is required when enabled');
            return;
          }
          if (!ruleFormData.subcategory) {
            showWarning('Missing Subcategory', 'Subcategory is required when category_id is enabled');
            return;
          }
        }
      }
      if (ruleFormData.use_to_account && !ruleFormData.to_account) {
        showWarning('Missing To Account', 'To Account is required when enabled');
        return;
      }

      let finalPayeeId: number | null = null;
      if (!ruleFormData.use_to_account && ruleFormData.use_payee && ruleFormData.payee_id) {
        finalPayeeId = await resolvePayeeId(ruleFormData.payee_id);
      }

      let finalCategoryId: number | null = null;
      if (!ruleFormData.use_to_account && ruleFormData.use_category && ruleFormData.category_id) {
        const catId = await resolveCategoryId(ruleFormData.category_id, null);
        if (catId) {
          if (ruleFormData.subcategory) {
            finalCategoryId = await resolveCategoryId(ruleFormData.subcategory, catId);
          } else {
            finalCategoryId = catId;
          }
        }
      }

      const payload = {
        import_plan_id: selectedPlan.import_plan_id,
        import_csv_field_id: ruleFormData.importcsvfield ? parseInt(ruleFormData.importcsvfield) : undefined,
        pattern: ruleFormData.pattern,
        order: selectedRule.order || 0, // Preserve existing order
        ignore: ruleFormData.ignore,
        match_type: ruleFormData.match_type,
        // When to_account is set (transfer), payee_id and category_id must be null
        payee_id: finalPayeeId,
        category_id: finalCategoryId,
        to_account_id: ruleFormData.use_to_account && ruleFormData.to_account ? parseInt(ruleFormData.to_account) : null
      };

      await api.put(`/accounts/import-plan-rules/${selectedRule.import_plan_rule_id}/`, payload);

      const updatedPlans = await loadAllImportPlans();
      const refreshed = updatedPlans.find(p => p.import_plan_id === (editingPlan?.import_plan_id || selectedPlan.import_plan_id));
      if (refreshed) setEditingPlan(refreshed);
      setIsRuleModalOpen(false);
      setSelectedRule(null);
      setSelectedPlan(null);
    } catch (error) {
      console.error('Error updating import plan rule:', error);
    }
  };

  const handleDeletePlan = async (plan: ImportPlan) => {
    const confirmed = await showConfirmDelete(
      'Delete Import Plan',
      'Are you sure you want to delete this import plan?'
    );
    if (!confirmed) return;
    
    try {
      await api.delete(`/accounts/import-plans/${plan.import_plan_id}/`);
      showSuccess('Import plan deleted successfully');
      await loadAllImportPlans();
    } catch (error) {
      console.error('Error deleting import plan:', error);
      showError('Failed to delete import plan', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDeleteRule = async (rule: ImportPlanRule) => {
    const confirmed = await showConfirmDelete(
      'Delete Rule',
      'Are you sure you want to delete this rule?'
    );
    if (!confirmed) return;
    
    try {
      await api.delete(`/accounts/import-plan-rules/${rule.import_plan_rule_id}/`);
      showSuccess('Rule deleted successfully');
      const updatedPlans = await loadAllImportPlans();
      if (editingPlan) {
        const refreshed = updatedPlans.find(p => p.import_plan_id === editingPlan.import_plan_id);
        if (refreshed) setEditingPlan(refreshed);
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      showError('Failed to delete rule', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id && editingPlan) {
      const oldRules = [...(editingPlan.rules || [])];
      const oldIndex = oldRules.findIndex(rule => rule.import_plan_rule_id === active.id);
      const newIndex = oldRules.findIndex(rule => rule.import_plan_rule_id === over.id);

      const newRules = arrayMove(oldRules, oldIndex, newIndex);
      
      // Update local state immediately for better UX
      setEditingPlan(prev => prev ? { ...prev, rules: newRules } : null);

      // Update order values and save to backend
      try {
        const updatePromises = newRules.map((rule, index) => {
          const newOrder = index + 1;
          if (rule.order !== newOrder) {
            return api.put(`/accounts/import-plan-rules/${rule.import_plan_rule_id}/`, {
              ...rule,
              order: newOrder
            });
          }
          return Promise.resolve();
        });

        await Promise.all(updatePromises);
        
        // Refresh data to ensure consistency
        const updatedPlans = await loadAllImportPlans();
        const refreshed = updatedPlans.find(p => p.import_plan_id === editingPlan.import_plan_id);
        if (refreshed) setEditingPlan(refreshed);
      } catch (error) {
        console.error('Error updating rule order:', error);
        // Revert on error
        const updatedPlans = await loadAllImportPlans();
        const refreshed = updatedPlans.find(p => p.import_plan_id === editingPlan.import_plan_id);
        if (refreshed) setEditingPlan(refreshed);
      }
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">CSV Import Plans</h1>
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between p-4">
          <div />
          <Button data-testid="new-plan-button" onClick={handleCreateNewPlan} size="sm">
            New Plan
          </Button>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground">Import Plan Name</th>
                <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground">Account</th>
                <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground">CSV Template</th>
                <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground">Num of Rules</th>
                <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {importPlans.map((plan) => (
                <tr data-testid={`plan-row-${plan.import_plan_id}`} key={plan.import_plan_id} className="border-b transition-colors hover:bg-muted/50">
                  <td className="px-2 py-1">{plan.name}</td>
                  <td className="px-2 py-1">{plan.account_name || '-'}</td>
                  <td className="px-2 py-1">{plan.import_csv_name}</td>
                  <td className="px-2 py-1">{(plan as any).rules_count ?? plan.rules?.length ?? 0}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditPlan(plan)}
                        className="h-8 w-8 p-0"
                        title="Edit Plan"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePlan(plan)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        title="Delete Plan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for creating/editing plans and rules */}
      <GravityDialog open={isModalOpen} onClose={() => setIsModalOpen(false)} size="l">
        <GravityDialog.Header caption={editingPlan ? 'Edit Import Plan' : 'Create Import Plan'} />
        <GravityDialog.Body>
          <div className="space-y-4 pt-2">
            <div className="text-sm text-muted-foreground mb-4">Manage a CSV import plan and its rules.</div>
            {/* Plan form */}
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="planName">Plan Name</Label>
                    <Input
                      data-testid="plan-name-input"
                      id="planName"
                      value={planFormData.name}
                      onChange={(e) => setPlanFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter plan name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="planAccount">Account</Label>
                    {editingPlan ? (
                      <Input value={editingPlan.account_name || ''} disabled />
                    ) : (
                      <GravitySelect
                        data-testid="plan-account-trigger"
                        placeholder="Select Account"
                        value={planFormData.account ? [planFormData.account] : []}
                        onUpdate={(val) => setPlanFormData(prev => ({ ...prev, account: val[0] || '' }))}
                        options={accounts
                          .filter(acc => !acc.is_closed && !acc.is_hidden || String(acc.account_id) === String(planFormData.account))
                          .map((account) => ({
                            value: account.account_id.toString(),
                            content: (account as any).string_name || `${account.account_id}: ${(account as any).accountholder_name || ''} (${account.name} - ${(account as any).titular_name})`
                          }))}
                        width="max"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="planTemplate">CSV Template</Label>
                  {editingPlan ? (
                    <Input value={editingPlan.import_csv_name || ''} disabled />
                  ) : (
                    <GravitySelect
                      data-testid="plan-csv-template-trigger"
                      placeholder="Select CSV Template"
                      value={planFormData.importcsv ? [planFormData.importcsv] : []}
                      onUpdate={(val) => setPlanFormData(prev => ({ ...prev, importcsv: val[0] || '' }))}
                      options={csvTemplates.map((template) => ({
                        value: template.import_csv_id.toString(),
                        content: template.name
                      }))}
                      width="max"
                    />
                  )}
                </div>

                {editingPlan && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold">Rules</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateNewRule(editingPlan)}
                      >
                        Add Rule
                      </Button>
                    </div>
                    <div className="rounded-md border overflow-auto max-h-96">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-muted/50 z-10">
                            <tr className="border-b bg-muted/50">
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Order</th>
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Field</th>
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Pattern</th>
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Ignore</th>
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Payee</th>
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Category</th>
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">To Account</th>
                              <th className="h-8 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <SortableContext
                            items={(editingPlan.rules || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(rule => rule.import_plan_rule_id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <tbody>
                              {(editingPlan.rules || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map((rule) => (
                                <SortableRuleRow
                                  key={rule.import_plan_rule_id}
                                  rule={rule}
                                  plan={editingPlan}
                                  onEdit={handleEditRule}
                                  onDelete={handleDeleteRule}
                                />
                              ))}
                              {(!editingPlan.rules || editingPlan.rules.length === 0) && (
                                <tr>
                                  <td className="px-4 py-3 text-muted-foreground" colSpan={8}>No rules yet.</td>
                                </tr>
                              )}
                            </tbody>
                          </SortableContext>
                        </table>
                      </DndContext>
                    </div>
                  </div>
                )}
              </>
          </div>
        </GravityDialog.Body>
        <GravityDialog.Footer
          preset="default"
          onClickButtonCancel={() => setIsModalOpen(false)}
          onClickButtonApply={handleSavePlan}
          textButtonApply={editingPlan ? 'Update Plan' : 'Create Plan'}
          textButtonCancel="Cancel"
          propsButtonApply={{ 'data-testid': 'modal-save-btn' } as any}
        />
      </GravityDialog>

      {/* Child dialog for Rule add/edit while keeping plan modal open behind */}
      <GravityDialog open={isRuleModalOpen} onClose={() => { setIsRuleModalOpen(false); setSelectedRule(null); setSelectedPlan(null); }} size="l">
        <GravityDialog.Header caption={selectedRule ? 'Edit Rule' : 'Create New Rule'} />
        <GravityDialog.Body>
          <div className="space-y-4 pt-2">
            <div className="text-sm text-muted-foreground mb-4">Configure matching and actions for this rule.</div>
            <div className="text-sm text-muted-foreground">Plan: <span className="font-medium text-foreground">{editingPlan?.name || selectedPlan?.name}</span></div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="field">CSV Field</Label>
                <GravitySelect
                  data-testid="rule-field-trigger"
                  placeholder="Select Field"
                  value={ruleFormData.importcsvfield ? [ruleFormData.importcsvfield] : []}
                  onUpdate={(val) => setRuleFormData(prev => ({ ...prev, importcsvfield: val[0] || '' }))}
                  options={csvFields.map((field) => ({
                    value: field.import_csv_field_id.toString(),
                    content: field.name
                  }))}
                  width="max"
                />
              </div>
              <div>
                <Label htmlFor="matchType">Match Type</Label>
                <RadioGroup
                  data-testid="rule-match-type"
                  value={ruleFormData.match_type}
                  onValueChange={(value) => setRuleFormData(prev => ({ ...prev, match_type: value as 'contains' | 'equals' }))}
                  className="flex items-center gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="equals" id="match_equals" data-testid="match-equals" />
                    <Label htmlFor="match_equals">Equals</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="contains" id="match_contains" data-testid="match-contains" />
                    <Label htmlFor="match_contains">Contains</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div>
              <Label htmlFor="pattern">Pattern</Label>
              <Input
                data-testid="rule-pattern-input"
                id="pattern"
                value={ruleFormData.pattern}
                onChange={(e) => setRuleFormData(prev => ({ ...prev, pattern: e.target.value }))}
                placeholder="Enter pattern to match"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                data-testid="rule-ignore-checkbox"
                type="checkbox"
                id="ignore"
                checked={ruleFormData.ignore}
                onChange={(e) => setRuleFormData(prev => ({ ...prev, ignore: e.target.checked }))}
              />
              <Label htmlFor="ignore">Ignore this row</Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    data-testid="rule-use-payee"
                    type="checkbox"
                    id="use_payee"
                    checked={ruleFormData.use_payee}
                    disabled={ruleFormData.use_to_account}
                    onChange={(e) => setRuleFormData(prev => ({ ...prev, use_payee: e.target.checked, payee_id: e.target.checked ? prev.payee_id : '' }))}
                  />
                  <Label htmlFor="use_payee" className={ruleFormData.use_to_account ? 'text-muted-foreground' : ''}>Use Payee</Label>
                </div>
                <GravitySelect
                  data-testid="payee-trigger"
                  filterable
                  disabled={!ruleFormData.use_payee || ruleFormData.use_to_account}
                  placeholder="Select or type payee"
                  value={ruleFormData.payee_id ? [ruleFormData.payee_id] : []}
                  onUpdate={(val) => setRuleFormData(prev => ({ ...prev, payee_id: val[0] || '' }))}
                  onFilterChange={(filter) => setPayeeFilter(filter)}
                  options={(() => {
                    const sortedPayees = [...payees].sort((a, b) => a.name.localeCompare(b.name));
                    const payeeOptions = sortedPayees.map((p) => ({ value: String(p.payee_id), content: p.name }));
                    if (payeeFilter.trim()) {
                      const exists = payees.some((p) => p.name.toLowerCase() === payeeFilter.trim().toLowerCase());
                      if (!exists) {
                        payeeOptions.unshift({
                          value: payeeFilter.trim(),
                          content: `Create "${payeeFilter.trim()}"`
                        });
                      }
                    }
                    return payeeOptions;
                  })()}
                  width="max"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    data-testid="rule-use-category"
                    type="checkbox"
                    id="use_category"
                    checked={ruleFormData.use_category}
                    disabled={ruleFormData.use_to_account}
                    onChange={(e) => setRuleFormData(prev => ({ ...prev, use_category: e.target.checked, category_id: e.target.checked ? prev.category_id : '', subcategory: e.target.checked ? prev.subcategory : '' }))}
                  />
                  <Label htmlFor="use_category" className={ruleFormData.use_to_account ? 'text-muted-foreground' : ''}>Use Category</Label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <GravitySelect
                    data-testid="category-trigger"
                    filterable
                    disabled={!ruleFormData.use_category || ruleFormData.use_to_account}
                    placeholder="Select Category"
                    value={ruleFormData.category_id ? [ruleFormData.category_id] : []}
                    onUpdate={(val) => {
                      const value = val[0];
                      setRuleFormData(prev => ({ ...prev, category_id: value || '', subcategory: '' }));
                      if (value && /^\d+$/.test(value)) {
                        loadSubCategories(parseInt(value));
                      } else {
                        setSubCategories([]);
                      }
                    }}
                    onFilterChange={(filter) => setCategoryFilter(filter)}
                    options={(() => {
                      const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));
                      const categoryOptions = sortedCategories.map((c) => ({ value: String(c.category_id), content: c.name }));
                      if (categoryFilter.trim()) {
                        const exists = categories.some((c) => c.name.toLowerCase() === categoryFilter.trim().toLowerCase());
                        if (!exists) {
                          categoryOptions.unshift({
                            value: categoryFilter.trim(),
                            content: `Create "${categoryFilter.trim()}"`
                          });
                        }
                      }
                      return categoryOptions;
                    })()}
                    width="max"
                  />
                  <GravitySelect
                    data-testid="subcategory-trigger"
                    filterable
                    disabled={!ruleFormData.use_category || !ruleFormData.category_id || ruleFormData.use_to_account}
                    placeholder="Select Subcategory"
                    value={ruleFormData.subcategory ? [ruleFormData.subcategory] : []}
                    onUpdate={(val) => setRuleFormData(prev => ({ ...prev, subcategory: val[0] || '' }))}
                    onFilterChange={(filter) => setSubcategoryFilter(filter)}
                    options={(() => {
                      const sortedSubcategories = [...subCategories].sort((a, b) => a.name.localeCompare(b.name));
                      const subcategoryOptions = sortedSubcategories.map((sc) => ({ value: String(sc.category_id), content: sc.name }));
                      if (subcategoryFilter.trim()) {
                        const exists = subCategories.some((sc) => sc.name.toLowerCase() === subcategoryFilter.trim().toLowerCase());
                        if (!exists) {
                          subcategoryOptions.unshift({
                            value: subcategoryFilter.trim(),
                            content: `Create "${subcategoryFilter.trim()}"`
                          });
                        }
                      }
                      return subcategoryOptions;
                    })()}
                    width="max"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    data-testid="rule-use-to-account"
                    type="checkbox"
                    id="use_to_account"
                    checked={ruleFormData.use_to_account}
                    onChange={(e) => setRuleFormData(prev => ({ 
                      ...prev, 
                      use_to_account: e.target.checked, 
                      to_account: e.target.checked ? prev.to_account : ''
                    }))}
                  />
                  <Label htmlFor="use_to_account">Use Account To</Label>
                </div>
                <GravitySelect
                  data-testid="to-account-trigger"
                  disabled={!ruleFormData.use_to_account}
                  placeholder="Select Account To"
                  value={ruleFormData.to_account ? [ruleFormData.to_account] : []}
                  onUpdate={(val) => setRuleFormData(prev => ({ ...prev, to_account: val[0] || '' }))}
                  options={accounts
                    .filter(acc => !acc.is_closed && !acc.is_hidden || String(acc.account_id) === String(ruleFormData.to_account))
                    .map((account) => ({
                      value: account.account_id.toString(),
                      content: (account as any).string_name || `${account.account_id}: ${(account as any).accountholder_name || ''} (${account.name} - ${(account as any).titular_name})`
                    }))}
                  width="max"
                />
              </div>
            </div>
          </div>
        </GravityDialog.Body>
        <GravityDialog.Footer
          preset="default"
          onClickButtonCancel={() => { setIsRuleModalOpen(false); setSelectedRule(null); setSelectedPlan(null); }}
          onClickButtonApply={selectedRule ? handleUpdateRule : handleSaveRule}
          textButtonApply={selectedRule ? 'Update Rule' : 'Create Rule'}
          textButtonCancel="Cancel"
        />
      </GravityDialog>
    </div>
  );
};

export default ImportPlansNew;
