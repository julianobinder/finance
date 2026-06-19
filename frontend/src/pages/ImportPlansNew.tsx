import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Upload } from 'lucide-react';
import api from '@/services/api';
import { showConfirm } from '@/utils/notifications';
import { ImportPlan, ImportPlanRule, Account, Payee, Category } from '@/types';

const ImportPlansNew: React.FC = () => {
  const [importPlans, setImportPlans] = useState<ImportPlan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<Category[]>([]);
  const [csvTemplates, setCsvTemplates] = useState<any[]>([]);
  const [csvFields, setCsvFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ImportPlan | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<ImportPlan | null>(null);

  // Form state for Import Plan
  const [planFormData, setPlanFormData] = useState({
    name: '',
    importcsv: ''
  });

  // Form state for Import Plan Rule
  const [ruleFormData, setRuleFormData] = useState({
    account: '',
    importcsvfield: '',
    pattern: '',
    order: 0,
    ignore: false,
    payee_id: '',
    category_id: '',
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
      const [accountsRes, payeesRes, categoriesRes, templatesRes] = await Promise.all([
        api.get('/accounts/'),
        api.get('/accounts/payees/'),
        api.get('/accounts/categories/'),
        api.get('/accounts/csv-templates/')
      ]);

      setAccounts(accountsRes.data.results);
      setPayees(payeesRes.data.results);
      setCategories(categoriesRes.data.results.filter((cat: Category) => !cat.parent_category_id));
      setCsvTemplates(templatesRes.data.results);
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  const loadImportPlans = async (templateId: number) => {
    try {
      const response = await api.get(`/accounts/import-plans/template/${templateId}/`);
      setImportPlans(response.data);
    } catch (error) {
      console.error('Error loading import plans:', error);
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
      const response = await api.get('/accounts/categories/');
      const subCats = response.data.results.filter((cat: Category) => cat.parent_category_id === categoryId);
      setSubCategories(subCats);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    const id = parseInt(templateId);
    setSelectedTemplate(id);
    loadImportPlans(id);
    loadCsvFields(id);
  };

  const handleCreateNewPlan = () => {
    setEditingPlan(null);
    setPlanFormData({ name: '', importcsv: selectedTemplate?.toString() || '' });
    setIsModalOpen(true);
  };

  const handleCreateNewRule = (plan: ImportPlan) => {
    setSelectedPlan(plan);
    setRuleFormData({
      account: '',
      importcsvfield: '',
      pattern: '',
      order: 0,
      ignore: false,
      payee_id: '',
      category_id: '',
      to_account: ''
    });
    setIsModalOpen(true);
  };

  const handleSavePlan = async () => {
    try {
      const payload = {
        name: planFormData.name,
        importcsv: parseInt(planFormData.importcsv)
      };

      if (editingPlan) {
        await api.put(`/accounts/import-plans/${editingPlan.import_plan_id}/`, payload);
      } else {
        await api.post('/accounts/import-plans/', payload);
      }

      if (selectedTemplate) {
        await loadImportPlans(selectedTemplate);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving import plan:', error);
    }
  };

  const handleSaveRule = async () => {
    if (!selectedPlan) return;

    try {
      const payload = {
        importplan: selectedPlan.import_plan_id,
        account: parseInt(ruleFormData.account),
        importcsvfield: parseInt(ruleFormData.importcsvfield),
        pattern: ruleFormData.pattern,
        order: ruleFormData.order,
        ignore: ruleFormData.ignore,
        payee_id: ruleFormData.payee_id ? parseInt(ruleFormData.payee_id) : null,
        category_id: ruleFormData.category_id ? parseInt(ruleFormData.category_id) : null,
        to_account: ruleFormData.to_account ? parseInt(ruleFormData.to_account) : null
      };

      await api.post('/accounts/import-plan-rules/', payload);

      if (selectedTemplate) {
        await loadImportPlans(selectedTemplate);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving import plan rule:', error);
    }
  };

  const handleDeletePlan = async (plan: ImportPlan) => {
    const confirmed = await showConfirm({
      title: 'Delete Import Plan',
      content: `Are you sure you want to delete this import plan?`
    });
    if (confirmed) {
      try {
        await api.delete(`/accounts/import-plans/${plan.import_plan_id}/`);
        if (selectedTemplate) {
          await loadImportPlans(selectedTemplate);
        }
      } catch (error) {
        console.error('Error deleting import plan:', error);
      }
    }
  };

  const handleDeleteRule = async (rule: ImportPlanRule) => {
    const confirmed = await showConfirm({
      title: 'Delete Rule',
      content: `Are you sure you want to delete this rule?`
    });
    if (confirmed) {
      try {
        await api.delete(`/accounts/import-plan-rules/${rule.import_plan_rule_id}/`);
        if (selectedTemplate) {
          await loadImportPlans(selectedTemplate);
        }
      } catch (error) {
        console.error('Error deleting rule:', error);
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Template Selection */}
        <div className="space-y-4">
          <div className="rounded-md border p-4">
            <h2 className="text-lg font-semibold mb-4">CSV Template</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="template">Select CSV Template</Label>
                <Select value={selectedTemplate?.toString() || ''} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select CSV Template" />
                  </SelectTrigger>
                  <SelectContent>
                    {csvTemplates.map((template) => (
                      <SelectItem key={template.import_csv_id} value={template.import_csv_id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Import Plans</h3>
                    <Button onClick={handleCreateNewPlan} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      New Plan
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    {importPlans.map((plan) => (
                      <div key={plan.import_plan_id} className="border rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{plan.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {plan.rules?.length || 0} rules
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => handleCreateNewRule(plan)}
                              size="sm"
                              variant="outline"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => handleDeletePlan(plan)}
                              size="sm"
                              variant="outline"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Rules for this plan */}
                        {plan.rules && plan.rules.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {plan.rules.map((rule) => (
                              <div key={rule.import_plan_rule_id} className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded">
                                <div>
                                  <span className="font-medium">{rule.pattern}</span>
                                  <span className="text-muted-foreground ml-2">
                                    → {rule.account_name}
                                  </span>
                                  {rule.ignore && <span className="text-red-500 ml-2">[IGNORE]</span>}
                                </div>
                                <Button
                                  onClick={() => handleDeleteRule(rule)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Rule Configuration */}
        <div className="space-y-4">
          <div className="rounded-md border p-4">
            <h2 className="text-lg font-semibold mb-4">Rule Configuration</h2>
            <p className="text-muted-foreground text-sm">
              Select a CSV template and create import plans with rules to automatically categorize transactions.
            </p>
          </div>
        </div>
      </div>

      {/* Modal for creating/editing plans and rules */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedPlan ? 'Create New Rule' : editingPlan ? 'Edit Import Plan' : 'Create Import Plan'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedPlan ? (
              // Rule form
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="account">Account</Label>
                    <Select value={ruleFormData.account} onValueChange={(value) => setRuleFormData(prev => ({ ...prev, account: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.account_id} value={account.account_id.toString()}>
                            {(account as any).string_name || account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="field">CSV Field</Label>
                    <Select value={ruleFormData.importcsvfield} onValueChange={(value) => setRuleFormData(prev => ({ ...prev, importcsvfield: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvFields.map((field) => (
                          <SelectItem key={field.import_csv_field_id} value={field.import_csv_field_id.toString()}>
                            {field.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="pattern">Pattern</Label>
                  <Input
                    id="pattern"
                    value={ruleFormData.pattern}
                    onChange={(e) => setRuleFormData(prev => ({ ...prev, pattern: e.target.value }))}
                    placeholder="Enter pattern to match"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="order">Order</Label>
                    <Input
                      id="order"
                      type="number"
                      value={ruleFormData.order}
                      onChange={(e) => setRuleFormData(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="ignore"
                      checked={ruleFormData.ignore}
                      onChange={(e) => setRuleFormData(prev => ({ ...prev, ignore: e.target.checked }))}
                    />
                    <Label htmlFor="ignore">Ignore this row</Label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="payee_id">Payee (Optional)</Label>
                    <Select value={ruleFormData.payee_id} onValueChange={(value) => setRuleFormData(prev => ({ ...prev, payee_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Payee" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...payees].sort((a, b) => a.name.localeCompare(b.name)).map((payee_id) => (
                          <SelectItem key={payee_id.payee_id} value={payee_id.payee_id.toString()}>
                            {payee_id.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="category_id">Category (Optional)</Label>
                    <Select value={ruleFormData.category_id} onValueChange={(value) => setRuleFormData(prev => ({ ...prev, category_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map((category_id) => (
                          <SelectItem key={category_id.category_id} value={category_id.category_id.toString()}>
                            {category_id.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              // Plan form
              <div>
                <Label htmlFor="planName">Plan Name</Label>
                <Input
                  id="planName"
                  value={planFormData.name}
                  onChange={(e) => setPlanFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter plan name"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={selectedPlan ? handleSaveRule : handleSavePlan}>
              {selectedPlan ? 'Create Rule' : editingPlan ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImportPlansNew;
