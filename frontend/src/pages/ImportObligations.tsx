import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, TextInput, Select } from '@gravity-ui/uikit';
import { ArrowLeft, Upload, Sparkles, Trash2 } from 'lucide-react';
import { showError, showSuccess, showConfirmDelete } from '@/utils/notifications';
import type { ObligationImportFormat } from '@/types';

const IMPORT_API = '/api/obligation-import/';

const TARGET_FIELD_LABELS: Record<string, string> = {
  name: 'Name (required)',
  amount: 'Amount (required)',
  due_date: 'Due Date',
  period: 'Month/Year',
  category: 'Category',
  payee: 'Payee',
  recurrence: 'Recurrence',
  is_recurring: 'Is Recurring',
  paid: 'Already Paid',
  direction: 'Type (Payable/Receivable)',
  note: 'Note',
};

const RECURRENCE_OPTIONS = [
  { value: '', content: '(one-off unless a row says otherwise)' },
  { value: 'monthly', content: 'Monthly' },
  { value: 'weekly', content: 'Weekly' },
  { value: 'yearly', content: 'Yearly' },
];

type Step = 'upload' | 'mapping' | 'preview';

// A raw spreadsheet category label resolves to either an existing category
// (AI matched it) or a proposed new one (AI translated/cleaned it; nothing
// existing fit), which apply() creates on import instead of the raw text.
type CategoryResolution = { categoryId: number } | { categoryName: string; categoryParent?: string };

function guessSourceColumn(target: string, headers: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const targetNorm = norm(target);
  const aliases: Record<string, string[]> = {
    name: ['name', 'description', 'bill', 'obligation'],
    amount: ['amount', 'value', 'estimate', 'valor'],
    due_date: ['duedate', 'date', 'due', 'vencimento', 'data'],
    period: ['mes', 'month', 'ano', 'year', 'periodo'],
    category: ['category', 'categoria'],
    payee: ['payee', 'vendor', 'beneficiario'],
    recurrence: ['recurrence', 'frequency', 'cadence', 'frequencia'],
    direction: ['tipo', 'type', 'direction'],
    note: ['note', 'notes', 'comment', 'observacao'],
  };
  const candidates = aliases[target] || [targetNorm];
  const match = headers.find((h) => candidates.some((c) => norm(h).includes(c)));
  return match || '';
}

export function ImportObligations() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'csv' | 'xlsx'>('csv');
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<any[]>([]);
  const [targetFields, setTargetFields] = useState<string[]>(Object.keys(TARGET_FIELD_LABELS));
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultRecurrence, setDefaultRecurrence] = useState('monthly');
  const [decimalSeparator, setDecimalSeparator] = useState('.');

  const [savedFormats, setSavedFormats] = useState<ObligationImportFormat[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [saveFormatName, setSaveFormatName] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewingWithAI, setPreviewingWithAI] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  // Raw category text (as it appeared in the sheet) -> a resolution, filled in
  // by AI category matching (either automatically via "Preview with AI", or
  // manually via the button in the preview step). Lets an import land on
  // existing categories instead of always creating new ones whenever the
  // sheet's spelling doesn't exactly match, and lets AI propose a concise
  // translated new category (instead of the raw untranslated text) when
  // nothing existing fits.
  const [categoryResolutions, setCategoryResolutions] = useState<Record<string, CategoryResolution>>({});
  const [aiSuggestingCategories, setAiSuggestingCategories] = useState(false);
  const [categoryNames, setCategoryNames] = useState<Record<number, string>>({});

  // Raw obligation NAME -> obligation_group_id, filled in by AI group
  // matching for names that didn't exactly match an existing group (an exact
  // match is already resolved server-side at preview time). Lets a bill
  // re-imported months apart (spelled slightly differently) attach to the
  // same recurring-bill group instead of staying unlinked.
  const [groupResolutions, setGroupResolutions] = useState<Record<string, number>>({});
  const [aiSuggestingGroups, setAiSuggestingGroups] = useState(false);
  const [groupNames, setGroupNames] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch(`${IMPORT_API}formats/`)
      .then((res) => res.json())
      .then((data) => setSavedFormats(data.results || []))
      .catch(() => undefined);

    fetch('/api/accounts/categories/')
      .then((res) => res.json())
      .then((data) => {
        const names: Record<number, string> = {};
        (data.results || []).forEach((c: any) => { names[c.category_id] = c.name; });
        setCategoryNames(names);
      })
      .catch(() => undefined);

    fetch('/api/transactions/ai-categorization/status/')
      .then((res) => res.json())
      .then((data) => setAiEnabled(!!data?.enabled))
      .catch(() => undefined);

    fetch('/api/obligation-groups/')
      .then((res) => res.json())
      .then((data) => {
        const names: Record<number, string> = {};
        (data.results || []).forEach((g: any) => { names[g.obligation_group_id] = g.name; });
        setGroupNames(names);
      })
      .catch(() => undefined);
  }, []);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    if (f) {
      const isCsv = f.name.toLowerCase().endsWith('.csv');
      setFileType(isCsv ? 'csv' : 'xlsx');
    }
  };

  const applySavedFormat = (fmt: ObligationImportFormat) => {
    const m: Record<string, string> = {};
    fmt.fields.forEach((f) => { m[f.target_field] = f.source_column; });
    setMapping(m);
    setFileType(fmt.file_type as 'csv' | 'xlsx');
    setSheetName(fmt.sheet_name || '');
    setHeaderRow(fmt.header_row || 1);
    setDecimalSeparator(fmt.decimal_separator || '.');
    setDefaultRecurrence(fmt.default_recurrence || '');
  };

  const handleAnalyze = async () => {
    if (!file) {
      showError('Choose a file first');
      return;
    }
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('file_type', fileType);
      if (sheetName) form.append('sheet_name', sheetName);
      form.append('header_row', String(headerRow));

      const res = await fetch(`${IMPORT_API}analyze/`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        showError('Could not read file', data.detail || 'Unknown error');
        return;
      }
      setHeaders(data.headers || []);
      setSample(data.sample || []);
      setSheets(data.sheets || []);
      if (data.sheet_name) setSheetName(data.sheet_name);
      setTargetFields(data.target_fields || Object.keys(TARGET_FIELD_LABELS));

      if (Object.keys(mapping).length === 0) {
        const guessed: Record<string, string> = {};
        (data.target_fields || []).forEach((t: string) => {
          const g = guessSourceColumn(t, data.headers || []);
          if (g) guessed[t] = g;
        });
        setMapping(guessed);
      }
      setStep('mapping');
    } catch (error) {
      showError('Could not read file', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAnalyzing(false);
    }
  };

  const buildFormatJson = () => ({
    file_type: fileType,
    sheet_name: sheetName || null,
    header_row: headerRow,
    decimal_separator: decimalSeparator,
    default_recurrence: defaultRecurrence || null,
    fields: Object.entries(mapping)
      .filter(([, source]) => !!source)
      .map(([target_field, source_column]) => ({ target_field, source_column })),
  });

  const runPreview = async (): Promise<any | null> => {
    if (!file) return null;
    if (!mapping.name || !mapping.amount) {
      showError('Map at least Name and Amount before previewing');
      return null;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('format_json', JSON.stringify(buildFormatJson()));
    const res = await fetch(`${IMPORT_API}preview/`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      showError('Preview failed', data.detail?.message || data.detail || 'Unknown error');
      return null;
    }
    setPreviewData(data);
    setCategoryResolutions({});
    setGroupResolutions({});
    setStep('preview');
    return data;
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      await runPreview();
    } catch (error) {
      showError('Preview failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setPreviewing(false);
    }
  };

  const handlePreviewWithAI = async () => {
    setPreviewingWithAI(true);
    try {
      const data = await runPreview();
      if (data?.unmatched_categories?.length > 0) {
        await handleAiSuggestCategories(data.unmatched_categories);
      }
      if (data?.unmatched_group_names?.length > 0) {
        await handleAiSuggestGroups(data.unmatched_group_names);
      }
    } catch (error) {
      showError('Preview failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setPreviewingWithAI(false);
    }
  };

  const handleAiSuggestCategories = async (unmatchedOverride?: string[]) => {
    const unmatched: string[] = unmatchedOverride ?? previewData?.unmatched_categories ?? [];
    if (unmatched.length === 0) return;
    setAiSuggestingCategories(true);
    try {
      const res = await fetch('/api/obligations/ai/match-categories/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: unmatched }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError('AI suggestion failed', data.detail || 'AI categorization is not configured');
        return;
      }

      const resolved: Record<string, CategoryResolution> = {};
      (data.matches || []).forEach((m: any) => {
        const label = unmatched[m.index];
        if (!label) return;
        if (m.category_id) resolved[label] = { categoryId: m.category_id };
        else if (m.category) resolved[label] = { categoryName: m.category, categoryParent: m.parent || undefined };
      });

      if (Object.keys(resolved).length === 0) {
        showSuccess('AI found no categorization for the unmatched labels');
        return;
      }

      setCategoryResolutions((prev) => ({ ...prev, ...resolved }));
      setPreviewData((prev: any) => ({
        ...prev,
        unmatched_categories: prev.unmatched_categories.filter((n: string) => !(n in resolved)),
      }));
      const matchedExisting = Object.values(resolved).filter((r) => 'categoryId' in r).length;
      const proposedNew = Object.keys(resolved).length - matchedExisting;
      const parts = [];
      if (matchedExisting) parts.push(`matched ${matchedExisting} to existing categories`);
      if (proposedNew) parts.push(`proposed ${proposedNew} new categor${proposedNew === 1 ? 'y' : 'ies'}`);
      showSuccess(`AI ${parts.join(', ')}`);
    } catch (error) {
      showError('AI suggestion failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAiSuggestingCategories(false);
    }
  };

  const handleAiSuggestGroups = async (unmatchedOverride?: string[]) => {
    const unmatched: string[] = unmatchedOverride ?? previewData?.unmatched_group_names ?? [];
    if (unmatched.length === 0) return;
    setAiSuggestingGroups(true);
    try {
      const res = await fetch('/api/obligations/ai/match-groups/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: unmatched }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError('AI suggestion failed', data.detail || 'AI categorization is not configured');
        return;
      }

      const resolved: Record<string, number> = {};
      (data.matches || []).forEach((m: any) => {
        const label = unmatched[m.index];
        if (label && m.obligation_group_id) resolved[label] = m.obligation_group_id;
      });

      if (Object.keys(resolved).length === 0) {
        showSuccess('AI found no matching groups for the unmatched bill names');
        return;
      }

      setGroupResolutions((prev) => ({ ...prev, ...resolved }));
      setPreviewData((prev: any) => ({
        ...prev,
        unmatched_group_names: prev.unmatched_group_names.filter((n: string) => !(n in resolved)),
      }));
      const n = Object.keys(resolved).length;
      showSuccess(`AI matched ${n} bill${n === 1 ? '' : 's'} to existing group${n === 1 ? '' : 's'}`);
    } catch (error) {
      showError('AI suggestion failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAiSuggestingGroups(false);
    }
  };

  const buildResolutions = () => {
    if (!previewData) return {};
    const resolutions: Record<string, any> = {};
    previewData.rows.forEach((row: any) => {
      const categoryResolution = row.category_raw ? categoryResolutions[row.category_raw] : undefined;
      const groupId = groupResolutions[row.name];
      if (!categoryResolution && !groupId) return;
      const key = String(row.occurrence_of_row);
      resolutions[key] = {
        ...(categoryResolution
          ? 'categoryId' in categoryResolution
            ? { category_id: categoryResolution.categoryId }
            : { category_name: categoryResolution.categoryName, category_parent: categoryResolution.categoryParent }
          : {}),
        ...(groupId ? { obligation_group_id: groupId } : {}),
      };
    });
    return resolutions;
  };

  const handleApply = async () => {
    if (!file) return;
    setApplying(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('format_json', JSON.stringify(buildFormatJson()));
      form.append('resolutions', JSON.stringify(buildResolutions()));
      const res = await fetch(`${IMPORT_API}apply/`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        showError('Import failed', data.detail?.message || data.detail || 'Unknown error');
        return;
      }
      setApplyResult(data);
      const matched = data.auto_matched_transactions || 0;
      showSuccess(
        `Imported: ${data.created} new bill(s), ${data.attached} extended, ` +
        `${data.occurrences_created} occurrence(s) added, ${data.occurrences_blocked} flagged as possible duplicates` +
        (matched > 0 ? `, ${matched} auto-matched to existing transactions` : '')
      );
    } catch (error) {
      showError('Import failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setApplying(false);
    }
  };

  const handleSaveFormat = async () => {
    if (!saveFormatName.trim()) {
      showError('Name the format first');
      return;
    }
    try {
      const res = await fetch(`${IMPORT_API}formats/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveFormatName.trim(), ...buildFormatJson() }),
      });
      if (res.ok) {
        showSuccess('Format saved');
        setSaveFormatName('');
        const data = await res.json();
        setSavedFormats((prev) => [...prev, data]);
      } else {
        showError('Failed to save format');
      }
    } catch (error) {
      showError('Failed to save format', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDeleteFormat = async (fmt: ObligationImportFormat) => {
    const confirmed = await showConfirmDelete('Delete Saved Format', `Delete the saved format "${fmt.name}"?`);
    if (!confirmed) return;
    try {
      const res = await fetch(`${IMPORT_API}formats/${fmt.obligation_import_format_id}/`, { method: 'DELETE' });
      if (res.ok) {
        showSuccess('Format deleted');
        setSavedFormats((prev) => prev.filter((f) => f.obligation_import_format_id !== fmt.obligation_import_format_id));
        if (selectedFormatId === String(fmt.obligation_import_format_id)) setSelectedFormatId('');
      } else {
        showError('Failed to delete format');
      }
    } catch (error) {
      showError('Failed to delete format', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/obligations">
          <Button view="flat"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Import Obligations</h1>
          <p className="text-muted-foreground text-sm">
            Map spreadsheet columns to obligation fields, preview, then create. Likely duplicates are flagged, not
            silently dropped.
          </p>
        </div>
      </div>

      {step === 'upload' && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          {savedFormats.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Use a saved format (optional)</label>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Select
                    value={selectedFormatId ? [selectedFormatId] : []}
                    onUpdate={(val) => {
                      const id = val[0] || '';
                      setSelectedFormatId(id);
                      const fmt = savedFormats.find((f) => String(f.obligation_import_format_id) === id);
                      if (fmt) applySavedFormat(fmt);
                    }}
                    options={savedFormats.map((f) => ({ value: String(f.obligation_import_format_id), content: f.name }))}
                    placeholder="Choose a format…"
                    hasClear
                    width="max"
                  />
                </div>
                {selectedFormatId && (
                  <Button
                    view="flat-danger"
                    title="Delete saved format"
                    onClick={() => {
                      const fmt = savedFormats.find((f) => String(f.obligation_import_format_id) === selectedFormatId);
                      if (fmt) handleDeleteFormat(fmt);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">File (.csv or .xlsx)</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              className="text-sm"
            />
          </div>
          <div className="flex gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Header Row</label>
              <TextInput
                type="number"
                value={String(headerRow)}
                onUpdate={(val) => setHeaderRow(Number(val) || 1)}
                style={{ width: 100 }}
              />
            </div>
          </div>
          <Button view="action" loading={analyzing} onClick={handleAnalyze}>
            <Upload className="mr-2 h-4 w-4" />
            Analyze
          </Button>
        </div>
      )}

      {step === 'mapping' && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          {sheets.length > 1 && (
            <div>
              <label className="block text-sm font-medium mb-1">Sheet</label>
              <select
                className="border rounded p-1.5 text-sm bg-background text-foreground"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
              >
                {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button view="flat" size="s" className="ml-2" onClick={handleAnalyze}>Re-analyze</Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="py-1 px-2 font-semibold">Obligation Field</th>
                  <th className="py-1 px-2 font-semibold">Source Column</th>
                </tr>
              </thead>
              <tbody>
                {targetFields.map((target) => (
                  <tr key={target} className="border-b border-border/30">
                    <td className="py-1 px-2">{TARGET_FIELD_LABELS[target] || target}</td>
                    <td className="py-1 px-2">
                      <select
                        className="border rounded p-1.5 text-sm bg-background text-foreground w-full"
                        value={mapping[target] || ''}
                        onChange={(e) => setMapping({ ...mapping, [target]: e.target.value })}
                      >
                        <option value="">(not mapped)</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Default Recurrence</label>
              <Select
                value={[defaultRecurrence]}
                onUpdate={(val) => setDefaultRecurrence(val[0] || '')}
                options={RECURRENCE_OPTIONS}
                width={280}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Decimal Separator</label>
              <select
                className="border rounded p-1.5 text-sm bg-background text-foreground"
                value={decimalSeparator}
                onChange={(e) => setDecimalSeparator(e.target.value)}
              >
                <option value=".">. (1234.56)</option>
                <option value=",">, (1234,56)</option>
              </select>
            </div>
          </div>

          {sample.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-1">Sample rows</div>
              <div className="overflow-x-auto border border-border rounded">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-muted/20">
                      {headers.map((h) => <th key={h} className="py-1 px-2 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.map((row, i) => (
                      <tr key={i} className="border-t border-border/20">
                        {headers.map((h) => <td key={h} className="py-1 px-2">{String(row[h] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <div className="flex items-end gap-2">
              <TextInput placeholder="Save mapping as…" value={saveFormatName} onUpdate={setSaveFormatName} />
              <Button view="normal" onClick={handleSaveFormat}>Save Format</Button>
            </div>
            <div className="flex gap-2">
              <Button view="normal" loading={previewing} onClick={handlePreview}>Preview</Button>
              {aiEnabled && (
                <Button view="action" loading={previewingWithAI} onClick={handlePreviewWithAI}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Preview with AI
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'preview' && previewData && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex gap-4 text-sm flex-wrap">
            <span className="font-semibold text-green-700 dark:text-green-400">{previewData.summary.new_occurrences} new</span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">{previewData.summary.duplicate_occurrences} possible duplicates</span>
            {previewData.summary.attached_obligations > 0 && (
              <span className="text-muted-foreground">
                ({previewData.summary.attached_obligations} bill{previewData.summary.attached_obligations === 1 ? '' : 's'} already exist — new occurrences will attach to {previewData.summary.attached_obligations === 1 ? 'it' : 'them'})
              </span>
            )}
            {previewData.summary.errors > 0 && (
              <span className="font-semibold text-red-700 dark:text-red-400">{previewData.summary.errors} errors</span>
            )}
          </div>

          {Object.keys(categoryResolutions).length > 0 && (
            <div className="text-sm bg-primary/5 border border-primary/20 rounded p-2 space-y-2">
              {Object.entries(categoryResolutions).some(([, r]) => 'categoryId' in r) && (
                <div>
                  <div className="font-medium mb-1">AI-matched to existing categories:</div>
                  {Object.entries(categoryResolutions)
                    .filter(([, r]) => 'categoryId' in r)
                    .map(([raw, r]) => {
                      const id = (r as { categoryId: number }).categoryId;
                      return <div key={raw}>{raw} → {categoryNames[id] || `#${id}`}</div>;
                    })}
                </div>
              )}
              {Object.entries(categoryResolutions).some(([, r]) => 'categoryName' in r) && (
                <div>
                  <div className="font-medium mb-1">AI-proposed new categories (created on import):</div>
                  {Object.entries(categoryResolutions)
                    .filter(([, r]) => 'categoryName' in r)
                    .map(([raw, r]) => {
                      const { categoryName, categoryParent } = r as { categoryName: string; categoryParent?: string };
                      return <div key={raw}>{raw} → {categoryName}{categoryParent ? ` (under ${categoryParent})` : ''}</div>;
                    })}
                </div>
              )}
            </div>
          )}

          {(previewData.unmatched_categories?.length > 0 || previewData.unmatched_payees?.length > 0) && (
            <div className="text-sm text-muted-foreground bg-muted/20 rounded p-2 space-y-2">
              {previewData.unmatched_categories?.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span>New categories that will be created: {previewData.unmatched_categories.join(', ')}</span>
                  {aiEnabled && (
                    <Button view="normal" size="s" loading={aiSuggestingCategories} onClick={() => handleAiSuggestCategories()}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      AI Match to Existing
                    </Button>
                  )}
                </div>
              )}
              {previewData.unmatched_payees?.length > 0 && (
                <div>New payees that will be created: {previewData.unmatched_payees.join(', ')}</div>
              )}
              {previewData.unmatched_group_names?.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span>Not linked to a group: {previewData.unmatched_group_names.join(', ')}</span>
                  {aiEnabled && (
                    <Button view="normal" size="s" loading={aiSuggestingGroups} onClick={() => handleAiSuggestGroups()}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      AI Match to Group
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {Object.keys(groupResolutions).length > 0 && (
            <div className="text-sm bg-primary/5 border border-primary/20 rounded p-2">
              <div className="font-medium mb-1">AI-matched to existing groups:</div>
              {Object.entries(groupResolutions).map(([raw, id]) => (
                <div key={raw}>{raw} → {groupNames[id] || `#${id}`}</div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="py-1 px-2">Row</th>
                  <th className="py-1 px-2">Name</th>
                  <th className="py-1 px-2 text-right">Amount</th>
                  <th className="py-1 px-2">Due Date</th>
                  <th className="py-1 px-2">Month/Year</th>
                  <th className="py-1 px-2">Category</th>
                  <th className="py-1 px-2">Group</th>
                  <th className="py-1 px-2">Type</th>
                  <th className="py-1 px-2">Recurring</th>
                  <th className="py-1 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row: any) => (
                  <tr key={row.row} className="border-b border-border/20" style={{ opacity: row.is_duplicate ? 0.7 : 1 }}>
                    <td className="py-1 px-2 text-muted-foreground">{row.row}</td>
                    <td className="py-1 px-2">{row.name}</td>
                    <td className="py-1 px-2 text-right">{row.amount}</td>
                    <td className="py-1 px-2">{row.due_date || '—'}</td>
                    <td className="py-1 px-2 text-muted-foreground">{row.period || '—'}</td>
                    <td className="py-1 px-2">
                      {row.category_raw ? (
                        (() => {
                          const resolution = categoryResolutions[row.category_raw];
                          if (!resolution) return row.category_raw;
                          if ('categoryId' in resolution) {
                            return `${row.category_raw} → ${categoryNames[resolution.categoryId] || `#${resolution.categoryId}`}`;
                          }
                          return `${row.category_raw} → ${resolution.categoryName} (new)`;
                        })()
                      ) : '—'}
                    </td>
                    <td className="py-1 px-2">
                      {(() => {
                        const groupId = groupResolutions[row.name] ?? row.obligation_group_id;
                        if (!groupId) return '—';
                        return groupNames[groupId] || row.obligation_group_name || `#${groupId}`;
                      })()}
                    </td>
                    <td className="py-1 px-2">{row.direction === 'receivable' ? 'Receivable' : 'Payable'}</td>
                    <td className="py-1 px-2">{row.is_recurring ? row.recurrence : 'one-off'}</td>
                    <td className="py-1 px-2">
                      {row.is_duplicate ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          Duplicate
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          New
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewData.errors?.length > 0 && (
            <div className="text-sm text-red-700 dark:text-red-400">
              {previewData.errors.map((e: any, i: number) => <div key={i}>Row {e.row}: {e.message}</div>)}
            </div>
          )}

          {!applyResult ? (
            <div className="flex justify-between">
              <Button view="normal" onClick={() => setStep('mapping')}>Back to Mapping</Button>
              <Button view="action" loading={applying} onClick={handleApply}>
                Import {previewData.summary.rows} Occurrence(s)
              </Button>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {applyResult.created} new bill{applyResult.created === 1 ? '' : 's'} created
                {applyResult.attached > 0 ? `, ${applyResult.attached} existing bill${applyResult.attached === 1 ? '' : 's'} extended` : ''}
                {' — '}{applyResult.occurrences_created} occurrence(s) added, {applyResult.occurrences_blocked} flagged as possible duplicates
                {applyResult.auto_matched_transactions > 0
                  ? `, auto-matched ${applyResult.auto_matched_transactions} to existing transactions.`
                  : '.'}
              </span>
              <Button view="action" onClick={() => navigate('/obligations')}>Done — Go to Obligations</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
