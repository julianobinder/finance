import React, { useState, useEffect } from 'react';
import { Plus, Upload, FileText, Edit, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import api from '@/services/api';

interface CSVField {
  import_csv_field_id?: number;
  name: string;
  map_field: string;
  type_field: string;
  format_field: string;
}

interface CSVTemplate {
  import_csv_id: number;
  name: string;
  fields: CSVField[];
}

const MAP_OPTIONS = [
  { value: 'NONE', label: '-- Select Map --' },
  { value: 'CASH_DATE', label: 'CASH_DATE' },
  { value: 'PAID_DATE', label: 'PAID_DATE' },
  { value: 'PAYEE_DESC', label: 'PAYEE_DESC' },
  { value: 'COMMENTS', label: 'COMMENTS' },
  { value: 'CURRENCY', label: 'CURRENCY' },
  { value: 'AMOUNT', label: 'AMOUNT' },
  { value: '-AMOUNT', label: '-AMOUNT (minus amount)' },
  { value: 'REFERENCE', label: 'REFERENCE' },
  { value: 'FEE', label: 'FEE' },
  { value: 'ORG_CURRENCY', label: 'ORG_CURRENCY' },
  { value: 'ORG_AMOUNT', label: 'ORG_AMOUNT' },
];

const TYPE_OPTIONS = [
  { value: 'TEXT', label: 'TEXT' },
  { value: 'NUMERIC', label: 'NUMERIC' },
  { value: 'DATE', label: 'DATE' },
];

export const CSVTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<CSVTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CSVTemplate | null>(null);
  const [fields, setFields] = useState<CSVField[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CSVTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<CSVTemplate | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/accounts/csv-templates/');
      setTemplates(response.data.results || response.data);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError('Failed to fetch CSV templates.');
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSelectTemplate = (template: CSVTemplate) => {
    setSelectedTemplate(template);
    const processedFields = (template.fields || []).map((field: any) => {
      const mapVal = field.map_field !== undefined ? field.map_field : field.map;
      const typeVal = field.type_field !== undefined ? field.type_field : field.type;
      const formatVal = field.format_field !== undefined ? field.format_field : field.format;
      return {
        ...field,
        map_field: mapVal && mapVal !== '' ? mapVal : 'NONE',
        type_field: typeVal || 'TEXT',
        format_field: formatVal || '',
      };
    });
    setFields(processedFields);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setEditingTemplate(null);
    setTemplateName('');
    setFields([]);
    setUploadedFile(null);
    setError(null);
  };

  const handleFileUpload = async (file: File) => {
    try {
      setError(null);
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/accounts/analyze-csv/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const processedFields = response.data.fields.map((field: CSVField) => ({
        ...field,
        map_field: field.map_field || 'NONE'
      }));
      setFields(processedFields);
      setUploadedFile(file);
    } catch (err: any) {
      console.error('Error analyzing CSV:', err);
      setError(err.response?.data?.error || 'Failed to analyze CSV file.');
    }
  };

  const handleSaveTemplate = async () => {
    try {
      setError(null);
      if (!templateName) {
        setError('Template name is required.');
        return;
      }

      const payload = {
        name: templateName,
        fields: fields.map(field => ({
          import_csv_field_id: field.import_csv_field_id,
          name: field.name,
          map_field: field.map_field === 'NONE' ? '' : field.map_field,
          type_field: field.type_field,
          format_field: field.format_field,
        })),
      };

      if (editingTemplate) {
        await api.put(`/accounts/csv-templates/${editingTemplate.import_csv_id}/`, payload);
      } else {
        await api.post('/accounts/csv-templates/', payload);
      }

      await fetchTemplates();
      handleCloseModal();
    } catch (err: any) {
      console.error('Error saving template:', err);
      setError(err.response?.data?.name?.[0] || 'Failed to save template.');
    }
  };

  const handleDeleteTemplate = async () => {
    if (deletingTemplate) {
      try {
        await api.delete(`/accounts/csv-templates/${deletingTemplate.import_csv_id}/`);
        await fetchTemplates();
        setIsDeleteModalOpen(false);
        setDeletingTemplate(null);
        if (selectedTemplate?.import_csv_id === deletingTemplate.import_csv_id) {
          setSelectedTemplate(null);
          setFields([]);
        }
      } catch (err) {
        console.error('Error deleting template:', err);
        setError('Failed to delete template.');
      }
    }
  };

  const openCreateModal = () => {
    setTemplateName('');
    setFields([]);
    setUploadedFile(null);
    setEditingTemplate(null);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (template: CSVTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    const processedFields = (template.fields || []).map((field: any) => {
      const mapVal = field.map_field !== undefined ? field.map_field : field.map;
      const typeVal = field.type_field !== undefined ? field.type_field : field.type;
      const formatVal = field.format_field !== undefined ? field.format_field : field.format;
      return {
        ...field,
        map_field: mapVal && mapVal !== '' ? mapVal : 'NONE',
        type_field: typeVal || 'TEXT',
        format_field: formatVal || '',
      };
    });
    setFields(processedFields);
    setUploadedFile(null);
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (template: CSVTemplate) => {
    setDeletingTemplate(template);
    setIsDeleteModalOpen(true);
  };

  const updateField = (index: number, field: Partial<CSVField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...field };
    setFields(newFields);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CSV Templates</h1>
          <p className="text-muted-foreground">
            Create and manage CSV import templates with field mapping and data type configuration.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Templates</h2>
            <Button 
              size="sm" 
              onClick={openCreateModal}
            >
              <Plus className="h-4 w-4 mr-2" /> New Template
            </Button>
          </div>
          
          <div className="rounded-md border">
            <div className="max-h-96 overflow-y-auto">
              {templates.map((template) => (
                <div
                  key={template.import_csv_id}
                  className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${
                    selectedTemplate?.import_csv_id === template.import_csv_id ? 'bg-muted/50' : ''
                  }`}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-green-500" />
                      <span className="font-medium">{template.name}</span>
                    </div>
                    <div className="flex space-x-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0" 
                        onClick={(e) => { e.stopPropagation(); openEditModal(template); }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 text-destructive" 
                        onClick={(e) => { e.stopPropagation(); openDeleteModal(template); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {template.fields?.length || 0} fields
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Field Mapping */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Field Mapping {selectedTemplate ? `- ${selectedTemplate.name}` : ''}
            </h2>
            {selectedTemplate && (
              <div className="text-sm text-muted-foreground">
                {fields.length} fields configured
              </div>
            )}
          </div>

          {selectedTemplate ? (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Field</th>
                      <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Map</th>
                      <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Type</th>
                      <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Format</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={index} className="border-b transition-colors hover:bg-muted/50">
                        <td className="px-2 py-1">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-green-500" />
                            <span className="font-medium">{field.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <span className="text-sm">
                            {field.map_field && field.map_field !== 'NONE'
                              ? MAP_OPTIONS.find(option => option.value === field.map_field)?.label 
                              : ''}
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          <span className="text-sm">
                            {TYPE_OPTIONS.find(option => option.value === (field.type_field || 'TEXT'))?.label || 'TEXT'}
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          <span className="text-sm text-muted-foreground">
                            {field.format_field || 'No format'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              Select a template to view field mappings
            </div>
          )}

          {/* Ignore Rules Info */}
          <div className="rounded-md border p-4 bg-muted/20">
            <h3 className="font-semibold mb-2">Ignore Rules</h3>
            <div className="text-sm space-y-1">
              <p>• <strong>NUMERIC</strong> fields: If MAP value is a number (e.g., '0'), rows with that value will be ignored</p>
              <p>• <strong>TEXT</strong> fields: If MAP value is text, rows containing that value will be ignored</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Template Modal */}
      <Dialog open={isCreateModalOpen || isEditModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create New Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Modify the template configuration and field mappings.' : 'Create a new CSV import template with field mappings and data types.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="templateName" className="text-right">
                Template Name
              </Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="col-span-3"
                placeholder="Enter template name"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Upload CSV</Label>
              <div className="col-span-3">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {uploadedFile && (
                  <div className="mt-2 text-sm text-green-600">
                    ✓ {uploadedFile.name} uploaded successfully
                  </div>
                )}
              </div>
            </div>

            {fields.length > 0 && (
              <div className="space-y-2">
                <Label>Field Configuration</Label>
                <div className="rounded-md border max-h-60 overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Field</th>
                        <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Map</th>
                        <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Type</th>
                        <th className="h-8 px-2 py-1 text-left font-medium text-muted-foreground">Format</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, index) => {
                        const chosenValues = fields
                          .map(f => f.map_field)
                          .filter(val => val && val !== 'NONE');
                        const availableMapOptions = MAP_OPTIONS.filter(option => {
                          if (option.value === 'NONE') return true;
                          if (option.value === field.map_field) return true;
                          return !chosenValues.includes(option.value);
                        });

                        return (
                          <tr key={index} className="border-b">
                            <td className="px-2 py-1">
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-green-500" />
                                <span className="font-medium">{field.name}</span>
                              </div>
                            </td>
                            <td className="px-2 py-1">
                              <Select
                                value={MAP_OPTIONS.find(option => option.value === field.map_field) ? field.map_field : 'NONE'}
                                onValueChange={(value) => updateField(index, { map_field: value })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Select map" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableMapOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1">
                              <Select
                                value={field.type_field || 'TEXT'}
                                onValueChange={(value) => updateField(index, { type_field: value })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TYPE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                value={field.format_field}
                                onChange={(e) => updateField(index, { format_field: e.target.value })}
                                placeholder="Format"
                                className="h-8"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate}>
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The template and all its field mappings will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            Are you sure you want to delete "{deletingTemplate?.name}"? This action cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};