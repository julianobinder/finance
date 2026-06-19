import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import api from '@/services/api';
import { showConfirm } from '@/utils/notifications';
import { ImportPlan, ImportPlanField, Account, Payee, Category } from '@/types';

const ImportPlans: React.FC = () => {
  const [importPlans, setImportPlans] = useState<ImportPlan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<Category[]>([]);
  const [csvTemplates, setCsvTemplates] = useState<any[]>([]);
  const [csvFields, setCsvFields] = useState<ImportPlanField[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ImportPlan | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    account: '',
    importcsv: '',
    importcsvfield: '',
    pattern: '',
    order: 0,
    ignore: false,
    usePayee: false,
    payee_id: '',
    useCategory: false,
    category_id: '',
    subCategory: '',
    isTransfer: false,
    toAccount: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      loadCsvFields(selectedTemplate);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (selectedAccount) {
      loadImportPlans(selectedAccount);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (formData.category_id) {
      loadSubCategories(parseInt(formData.category_id));
    }
  }, [formData.category_id]);

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

  const loadCsvFields = async (templateId: number) => {
    try {
      const response = await api.get(`/accounts/import-plans/fields/${templateId}/`);
      setCsvFields(response.data);
    } catch (error) {
      console.error('Error loading CSV fields:', error);
    }
  };

  const loadImportPlans = async (accountId: number) => {
    try {
      const response = await api.get(`/accounts/import-plans/account/${accountId}/`);
      setImportPlans(response.data);
    } catch (error) {
      console.error('Error loading import plans:', error);
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

  const handleCreateNew = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      account: '',
      importcsv: '',
      importcsvfield: '',
      pattern: '',
      order: 0,
      ignore: false,
      usePayee: false,
      payee_id: '',
      useCategory: false,
      category_id: '',
      subCategory: '',
      isTransfer: false,
      toAccount: ''
    });
    setIsModalOpen(true);
  };

  const handleEdit = (plan: ImportPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      account: plan.account.toString(),
      importcsv: plan.importcsv.toString(),
      importcsvfield: plan.importcsvfield.toString(),
      pattern: plan.pattern,
      order: plan.order,
      ignore: plan.ignore,
      usePayee: !!plan.payee_id,
      payee_id: plan.payee_id?.toString() || '',
      useCategory: !!plan.category_id,
      category_id: plan.category_id?.toString() || '',
      subCategory: '',
      isTransfer: !!plan.to_account,
      toAccount: plan.to_account?.toString() || ''
    });
    setSelectedTemplate(plan.importcsv);
    setSelectedField(plan.importcsvfield);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const planData = {
        name: formData.name,
        account: parseInt(formData.account),
        importcsv: parseInt(formData.importcsv),
        importcsvfield: parseInt(formData.importcsvfield),
        pattern: formData.pattern,
        order: formData.order,
        ignore: formData.ignore,
        payee_id: formData.usePayee ? parseInt(formData.payee_id) : null,
        category_id: formData.useCategory ? parseInt(formData.subCategory || formData.category_id) : null,
        to_account: formData.isTransfer ? parseInt(formData.toAccount) : null
      };

      if (editingPlan) {
        await api.put(`/accounts/import-plans/${editingPlan.import_plan_id}/`, planData);
      } else {
        await api.post('/accounts/import-plans/', planData);
      }

      setIsModalOpen(false);
      if (selectedAccount) {
        loadImportPlans(selectedAccount);
      }
    } catch (error) {
      console.error('Error saving import plan:', error);
    }
  };

  const handleDelete = async (plan: ImportPlan) => {
    const confirmed = await showConfirm({
      title: 'Delete Import Plan',
      content: `Are you sure you want to delete the import plan "${plan.name}"?`
    });
    if (confirmed) {
      try {
        await api.delete(`/accounts/import-plans/${plan.import_plan_id}/`);
        if (selectedAccount) {
          loadImportPlans(selectedAccount);
        }
      } catch (error) {
        console.error('Error deleting import plan:', error);
      }
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(parseInt(templateId));
    setFormData(prev => ({ ...prev, importcsv: templateId, importcsvfield: '' }));
    setSelectedField(null);
  };

  const handleFieldChange = (fieldId: string) => {
    setSelectedField(parseInt(fieldId));
    setFormData(prev => ({ ...prev, importcsvfield: fieldId }));
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">CSV Import Plans</h1>
        <Button onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Import Plan
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Role Configuration */}
        <div className="space-y-4">
          <div className="rounded-md border p-4">
            <h2 className="text-lg font-semibold mb-4">Role Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="template">CSV Template</Label>
                <Select value={formData.importcsv} onValueChange={handleTemplateChange}>
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

              <div>
                <Label htmlFor="field">CSV Field</Label>
                <Select value={formData.importcsvfield} onValueChange={handleFieldChange} disabled={!selectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select CSV Field" />
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

              <div>
                <Label htmlFor="account">Account</Label>
                <Select value={formData.account} onValueChange={(value) => setFormData(prev => ({ ...prev, account: value }))}>
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
                <Label htmlFor="pattern">Contains</Label>
                <Input
                  id="pattern"
                  value={formData.pattern}
                  onChange={(e) => setFormData(prev => ({ ...prev, pattern: e.target.value }))}
                  placeholder="Text or value to match"
                />
              </div>

              <div>
                <Label htmlFor="order">Order</Label>
                <Input
                  id="order"
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ignore"
                  checked={formData.ignore}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ignore: !!checked }))}
                />
                <Label htmlFor="ignore">IGNORE ROW - Ignore matches</Label>
              </div>

              {/* Payee Section */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="usePayee"
                    checked={formData.usePayee}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, usePayee: !!checked }))}
                  />
                  <Label htmlFor="usePayee">Use Payee</Label>
                </div>
                {formData.usePayee && (
                  <Select value={formData.payee_id} onValueChange={(value) => setFormData(prev => ({ ...prev, payee_id: value }))}>
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
                )}
              </div>

              {/* Category Section */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="useCategory"
                    checked={formData.useCategory}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, useCategory: !!checked }))}
                  />
                  <Label htmlFor="useCategory">Use Category</Label>
                </div>
                {formData.useCategory && (
                  <div className="space-y-2">
                    <Select value={formData.category_id} onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value, subCategory: '' }))}>
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
                    {formData.category_id && (
                      <Select value={formData.subCategory} onValueChange={(value) => setFormData(prev => ({ ...prev, subCategory: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Sub-Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {[...subCategories].sort((a, b) => a.name.localeCompare(b.name)).map((subCat) => (
                            <SelectItem key={subCat.category_id} value={subCat.category_id.toString()}>
                              {subCat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {/* Transfer Section */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isTransfer"
                    checked={formData.isTransfer}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isTransfer: !!checked }))}
                  />
                  <Label htmlFor="isTransfer">Transfer</Label>
                </div>
                {formData.isTransfer && (
                  <Select value={formData.toAccount} onValueChange={(value) => setFormData(prev => ({ ...prev, toAccount: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Destination Account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.account_id} value={account.account_id.toString()}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Import Plans List */}
        <div className="space-y-4">
          <div className="rounded-md border p-4">
            <h2 className="text-lg font-semibold mb-4">Import Plans</h2>
            
            <div className="space-y-2">
              <div>
                <Label htmlFor="planAccount">Filter by Account</Label>
                <Select value={selectedAccount?.toString() || ''} onValueChange={(value) => setSelectedAccount(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Account to view plans" />
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

              <div className="space-y-2">
                {importPlans.map((plan) => (
                  <div key={plan.import_plan_id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50">
                    <div className="flex-1">
                      <div className="font-medium">{plan.name || 'Unnamed'}</div>
                      <div className="text-sm text-muted-foreground">
                        {plan.importcsv_name} - {plan.importcsvfield_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Pattern: "{plan.pattern}" | Order: {plan.order}
                        {plan.ignore && <span className="text-red-500 ml-2">[IGNORE]</span>}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(plan)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(plan)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? 'Edit Import Plan' : 'Create New Import Plan'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="modalName">Plan Name</Label>
              <Input
                id="modalName"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter plan name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingPlan ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImportPlans;
