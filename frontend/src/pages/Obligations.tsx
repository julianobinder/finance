import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { Button, Dialog, TextInput, Checkbox, Select, TabProvider, TabList, Tab } from '@gravity-ui/uikit';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  Undo2,
  Eye,
  EyeOff,
  Link2,
  Sparkles,
  Upload,
  Layers,
} from 'lucide-react';
import { showError, showSuccess, showConfirm, showConfirmDelete } from '@/utils/notifications';
import { formatAmount, formatDate } from '@/utils/format';
import { useDisplaySettings } from '@/contexts/DisplaySettingsContext';
import type { Obligation, ObligationGroup, ObligationOccurrence } from '@/types';

const API = '/api/obligations/';
const OCC_API = '/api/obligation-occurrences/';
const GROUP_API = '/api/obligation-groups/';

const MONTH_OPTIONS = [
  { value: '', content: '(any month)' },
  ...[
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ].map((name, i) => ({ value: String(i + 1), content: name })),
];

type CategoryOption = { category_id: number; name: string; parent_category_id: number | null; merged_into_category_id?: number | null };
type PayeeOption = { payee_id: number; name: string; merged_into_payee_id?: number | null };

const RECURRENCE_OPTIONS = [
  { value: 'monthly', content: 'Monthly' },
  { value: 'weekly', content: 'Weekly' },
  { value: 'yearly', content: 'Yearly' },
];

const BlockedBadge = () => (
  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
    Duplicate
  </span>
);

const DIRECTION_OPTIONS = [
  { value: 'payable', content: 'Payable (a bill you owe)' },
  { value: 'receivable', content: 'Receivable (income you expect)' },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  done: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  late: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

function occurrenceStatus(occ: ObligationOccurrence): { label: string; className: string } {
  const isReceivable = occ.direction === 'receivable';
  if (occ.paid) {
    return { label: isReceivable ? 'Received' : 'Paid', className: STATUS_BADGE_CLASSES.done };
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (occ.due_date && occ.due_date < todayStr) {
    return { label: 'Late', className: STATUS_BADGE_CLASSES.late };
  }
  return { label: 'Pending', className: STATUS_BADGE_CLASSES.pending };
}

const StatusBadge = ({ occ }: { occ: ObligationOccurrence }) => {
  const { label, className } = occurrenceStatus(occ);
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${className}`}>{label}</span>;
};

// Which account a candidate/assigned transaction belongs to -- easy to miss
// when several accounts have similarly-dated, similarly-sized transactions.
const AccountBadge = ({ name }: { name?: string | null }) =>
  name ? (
    <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground whitespace-nowrap">{name}</span>
  ) : null;

// Signed +/- with color so incoming vs outgoing transactions are obvious at a
// glance in the assign-transactions panel, instead of every row looking the
// same once the sign was stripped by Math.abs().
const SignedAmount = ({
  amount,
  currencySymbol,
  locale,
}: {
  amount: number;
  currencySymbol?: string | null;
  locale?: string;
}) => {
  const isIncoming = amount > 0;
  return (
    <span className={`font-semibold ${isIncoming ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
      {isIncoming ? '+' : '−'} {formatAmount(Math.abs(amount), currencySymbol, locale)}
    </span>
  );
};

interface AssignDialogState {
  occurrence: ObligationOccurrence;
  assigned: any[];
  candidates: any[];
  selected: Set<number>;
  loading: boolean;
  aiLoading: boolean;
  aiExplanation: string | null;
  searching: boolean; // true once the candidate list reflects a manual search, not just the default suggestions
}

const emptySearchForm = { text: '', minAmount: '', maxAmount: '', allTime: false, ignoreDirection: false };

export function Obligations() {
  const { defaultLocale, defaultCurrencySymbol } = useDisplaySettings();
  const [activeTab, setActiveTab] = useState<'obligations' | 'occurrences'>('obligations');
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showPaidNested, setShowPaidNested] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [payees, setPayees] = useState<PayeeOption[]>([]);
  const [groups, setGroups] = useState<ObligationGroup[]>([]);

  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [detailsById, setDetailsById] = useState<Record<number, Obligation>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingObligation, setEditingObligation] = useState<Obligation | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category_id: '' as string | number,
    payee_id: '' as string | number,
    obligation_group_id: '' as string | number,
    is_recurring: false,
    recurrence: 'monthly',
    estimated_amount: '',
    direction: 'payable' as 'payable' | 'receivable',
    note: '',
    first_due_date: '',
    first_amount: '',
  });
  const [aiSuggesting, setAiSuggesting] = useState(false);

  const [assignDialog, setAssignDialog] = useState<AssignDialogState | null>(null);
  const [searchForm, setSearchForm] = useState(emptySearchForm);
  const [searchingCandidates, setSearchingCandidates] = useState(false);

  // ── Edit Occurrence (touches both the occurrence and its parent Obligation:
  // name/category/type/group are shared across all sibling occurrences by
  // design, so editing them here edits the Obligation, not just this row) ──
  const [editOccDialog, setEditOccDialog] = useState<{ occ: ObligationOccurrence; obligation: Obligation } | null>(null);
  const [occFormData, setOccFormData] = useState({
    period: '',
    name: '',
    category_id: '' as string | number,
    direction: 'payable' as 'payable' | 'receivable',
    obligation_group_id: '' as string | number,
    due_date: '',
    paid_date: '',
    note: '',
    estimated_amount: '',
  });

  // ── Groups management ────────────────────────────────────────────────────
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ObligationGroup | null>(null);
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    category_id: '' as string | number,
    direction: 'payable' as 'payable' | 'receivable',
    is_recurring: false,
    recurrence: 'monthly',
    expected_day_of_month: '',
    expected_weekday: '',
  });

  // ── Flat Occurrences tab ─────────────────────────────────────────────────
  const [occurrences, setOccurrences] = useState<ObligationOccurrence[]>([]);
  const [occLoading, setOccLoading] = useState(false);
  const [occStatusFilter, setOccStatusFilter] = useState<'all' | 'pending' | 'late'>('all');
  const [showPaidOcc, setShowPaidOcc] = useState(false);
  const [occYear, setOccYear] = useState('');
  const [occMonth, setOccMonth] = useState('');
  const [occSearch, setOccSearch] = useState('');
  const [occDirection, setOccDirection] = useState<'' | 'payable' | 'receivable'>('');
  const [occCategoryId, setOccCategoryId] = useState('');
  const [selectedOccIds, setSelectedOccIds] = useState<Set<number>>(new Set());

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(`Failed to fetch obligations: ${res.statusText}`);
      const data = await res.json();
      setObligations(data.results || []);
    } catch (error) {
      showError('Failed to load obligations', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const [catRes, payeeRes] = await Promise.all([
        fetch('/api/accounts/categories/'),
        fetch('/api/accounts/payees/'),
      ]);
      const catData = await catRes.json();
      const payeeData = await payeeRes.json();
      setCategories(catData.results || []);
      setPayees(payeeData.results || []);
    } catch (error) {
      showError('Failed to load categories/payees', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch(GROUP_API);
      const data = await res.json();
      setGroups(data.results || []);
    } catch (error) {
      showError('Failed to load obligation groups', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const fetchOccurrences = async () => {
    setOccLoading(true);
    try {
      const params = new URLSearchParams();
      if (occStatusFilter === 'pending') params.set('status', 'pending');
      else if (occStatusFilter === 'late') params.set('status', 'late');
      else if (!showPaidOcc) params.set('paid', 'false');
      if (occYear) params.set('year', occYear);
      if (occMonth) params.set('month', occMonth);
      if (occSearch.trim()) params.set('search', occSearch.trim());
      if (occDirection) params.set('direction', occDirection);
      if (occCategoryId) params.set('category_id', occCategoryId);

      const res = await fetch(`${OCC_API}?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch occurrences: ${res.statusText}`);
      const data = await res.json();
      setOccurrences(data.results || []);
      setSelectedOccIds(new Set()); // selection is filter-scoped, cleared on every refetch
    } catch (error) {
      showError('Failed to load occurrences', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setOccLoading(false);
    }
  };

  const toggleOccSelected = (id: number) => {
    setSelectedOccIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOccSelected = () => {
    setSelectedOccIds((prev) => (prev.size === occurrences.length ? new Set() : new Set(occurrences.map((o) => o.obligation_occurrence_id))));
  };

  const handleBulkDeleteOccurrences = async () => {
    if (selectedOccIds.size === 0) return;
    const confirmed = await showConfirmDelete(
      'Delete Occurrences',
      `Delete ${selectedOccIds.size} selected occurrence(s)? Any with assigned transactions will be skipped.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`${OCC_API}bulk-delete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occurrence_ids: Array.from(selectedOccIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError('Failed to delete occurrences', data.detail || 'Unknown error');
        return;
      }
      showSuccess(
        `Deleted ${data.deleted} occurrence(s)` +
        (data.skipped > 0 ? `, skipped ${data.skipped} (assigned transactions or a linked duplicate)` : '')
      );
      await fetchOccurrences();
      await fetchAll();
    } catch (error) {
      showError('Failed to delete occurrences', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  useEffect(() => {
    fetchAll();
    fetchLookups();
    fetchGroups();
  }, []);

  useEffect(() => {
    if (activeTab === 'occurrences') fetchOccurrences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, occStatusFilter, showPaidOcc, occYear, occMonth, occSearch, occDirection, occCategoryId]);

  const blockedCount = useMemo(() => obligations.filter((o) => o.is_blocked).length, [obligations]);

  const visibleObligations = useMemo(() => {
    const list = showBlocked ? obligations : obligations.filter((o) => !o.is_blocked);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [obligations, showBlocked]);

  const categoryFullName = (id: number | null): string => {
    if (id === null) return '';
    const cat = categories.find((c) => c.category_id === id);
    if (!cat) return '';
    if (cat.parent_category_id) {
      const parent = categories.find((c) => c.category_id === cat.parent_category_id);
      return parent ? `${parent.name}: ${cat.name}` : cat.name;
    }
    return cat.name;
  };

  const categoryOptions = useMemo(
    () => [
      { value: '', content: '(none)' },
      ...categories
        .filter((c) => !c.merged_into_category_id)
        .map((c) => ({ value: String(c.category_id), content: categoryFullName(c.category_id) }))
        .sort((a, b) => a.content.localeCompare(b.content)),
    ],
    [categories]
  );

  const payeeOptions = useMemo(
    () => [
      { value: '', content: '(none)' },
      ...payees
        .filter((p) => !p.merged_into_payee_id)
        .map((p) => ({ value: String(p.payee_id), content: p.name }))
        .sort((a, b) => a.content.localeCompare(b.content)),
    ],
    [payees]
  );

  // ── Expand / detail ──────────────────────────────────────────────────────

  const fetchDetail = async (id: number) => {
    try {
      const res = await fetch(`${API}${id}/`);
      if (!res.ok) throw new Error('Failed to load occurrences');
      const data = await res.json();
      setDetailsById((prev) => ({ ...prev, [id]: data }));
    } catch (error) {
      showError('Failed to load occurrences', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const toggleExpand = (ob: Obligation) => {
    const isOpen = !!expandedIds[ob.obligation_id];
    setExpandedIds((prev) => ({ ...prev, [ob.obligation_id]: !isOpen }));
    if (!isOpen) fetchDetail(ob.obligation_id);
  };

  const refreshDetail = async (obligationId: number) => {
    await fetchDetail(obligationId);
    await fetchAll();
    if (activeTab === 'occurrences') await fetchOccurrences();
  };

  // ── Create / edit ────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingObligation(null);
    setFormData({
      name: '',
      category_id: '',
      payee_id: '',
      obligation_group_id: '',
      is_recurring: false,
      recurrence: 'monthly',
      estimated_amount: '',
      direction: 'payable',
      note: '',
      first_due_date: '',
      first_amount: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (ob: Obligation) => {
    setEditingObligation(ob);
    setFormData({
      name: ob.name,
      category_id: ob.category_id ?? '',
      payee_id: ob.payee_id ?? '',
      obligation_group_id: ob.obligation_group_id ?? '',
      is_recurring: ob.is_recurring,
      recurrence: ob.recurrence || 'monthly',
      estimated_amount: ob.estimated_amount !== null ? String(ob.estimated_amount) : '',
      direction: ob.direction || 'payable',
      note: ob.note || '',
      first_due_date: '',
      first_amount: '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingObligation(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      showError('Please enter a name');
      return;
    }
    if (formData.is_recurring && !formData.recurrence) {
      showError('Please choose a recurrence cadence');
      return;
    }

    const isEditing = !!editingObligation;
    const url = isEditing ? `${API}${editingObligation!.obligation_id}/` : API;
    const method = isEditing ? 'PUT' : 'POST';

    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      category_id: formData.category_id ? Number(formData.category_id) : null,
      payee_id: formData.payee_id ? Number(formData.payee_id) : null,
      obligation_group_id: formData.obligation_group_id ? Number(formData.obligation_group_id) : null,
      is_recurring: formData.is_recurring,
      recurrence: formData.is_recurring ? formData.recurrence : null,
      estimated_amount: formData.estimated_amount ? Number(formData.estimated_amount) : null,
      direction: formData.direction,
      note: formData.note || null,
      is_active: true,
    };
    if (!isEditing) {
      payload.first_due_date = formData.first_due_date || null;
      payload.first_amount = formData.first_amount ? Number(formData.first_amount) : null;
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        flushSync(() => closeModal());
        if (!isEditing && data.is_blocked) {
          showSuccess('Obligation created, but flagged as a possible duplicate — review it under "Show Blocked".');
        } else {
          showSuccess(`Obligation ${isEditing ? 'updated' : 'created'} successfully`);
        }
        await fetchAll();
      } else {
        const err = await res.json();
        showError(`Failed to ${isEditing ? 'update' : 'create'} obligation`, typeof err === 'string' ? err : err.detail || JSON.stringify(err));
      }
    } catch (error) {
      showError(`Failed to ${isEditing ? 'update' : 'create'} obligation`, error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleAiSuggestCategory = async () => {
    if (!formData.name.trim()) {
      showError('Enter a name first');
      return;
    }
    setAiSuggesting(true);
    try {
      const res = await fetch(`${API}ai/suggest-categories/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obligations: [{ index: 0, name: formData.name, note: formData.note || null }] }),
      });
      if (!res.ok) {
        const err = await res.json();
        showError('AI suggestion failed', err.detail || 'AI categorization is not configured');
        return;
      }
      const data = await res.json();
      const suggestion = data.suggestions?.[0];
      if (!suggestion) {
        showError('AI returned no suggestion');
        return;
      }
      if (suggestion.category_id) {
        setFormData((prev) => ({ ...prev, category_id: suggestion.category_id }));
        showSuccess('Category suggested');
      } else if (suggestion.category) {
        showSuccess(`AI suggests a new category: "${suggestion.category}"${suggestion.parent ? ` (under ${suggestion.parent})` : ''}. Create it on the Categories page, then select it here.`);
      } else {
        showSuccess('AI had no confident suggestion');
      }
    } catch (error) {
      showError('AI suggestion failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleDelete = async (ob: Obligation) => {
    const confirmed = await showConfirmDelete('Delete Obligation', `Delete "${ob.name}" and all of its occurrences?`);
    if (!confirmed) return;
    try {
      const res = await fetch(`${API}${ob.obligation_id}/`, { method: 'DELETE' });
      if (res.ok) {
        showSuccess('Obligation deleted');
        await fetchAll();
      } else {
        const err = await res.json();
        showError('Failed to delete obligation', err.detail || 'Unknown error');
      }
    } catch (error) {
      showError('Failed to delete obligation', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUnblockObligation = async (ob: Obligation) => {
    try {
      const res = await fetch(`${API}${ob.obligation_id}/unblock/`, { method: 'POST' });
      if (res.ok) {
        showSuccess(`"${ob.name}" unblocked`);
        await fetchAll();
      } else {
        showError('Failed to unblock');
      }
    } catch (error) {
      showError('Failed to unblock', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // ── Groups ────────────────────────────────────────────────────────────────

  const groupOptions = useMemo(
    () => [
      { value: '', content: '(none)' },
      ...groups
        .map((g) => ({ value: String(g.obligation_group_id), content: g.name }))
        .sort((a, b) => a.content.localeCompare(b.content)),
    ],
    [groups]
  );

  const openCreateGroupForm = () => {
    setEditingGroup(null);
    setGroupFormData({
      name: '',
      category_id: '',
      direction: 'payable',
      is_recurring: false,
      recurrence: 'monthly',
      expected_day_of_month: '',
      expected_weekday: '',
    });
    setIsGroupFormOpen(true);
  };

  const openEditGroupForm = (g: ObligationGroup) => {
    setEditingGroup(g);
    setGroupFormData({
      name: g.name,
      category_id: g.category_id ?? '',
      direction: g.direction,
      is_recurring: !!g.recurrence,
      recurrence: g.recurrence || 'monthly',
      expected_day_of_month: g.expected_day_of_month !== null ? String(g.expected_day_of_month) : '',
      expected_weekday: g.expected_weekday || '',
    });
    setIsGroupFormOpen(true);
  };

  const closeGroupForm = () => {
    setIsGroupFormOpen(false);
    setEditingGroup(null);
  };

  const handleGroupSubmit = async () => {
    if (!groupFormData.name.trim()) {
      showError('Please enter a name');
      return;
    }
    const isEditing = !!editingGroup;
    const url = isEditing ? `${GROUP_API}${editingGroup!.obligation_group_id}/` : GROUP_API;
    const payload = {
      name: groupFormData.name.trim(),
      category_id: groupFormData.category_id ? Number(groupFormData.category_id) : null,
      direction: groupFormData.direction,
      recurrence: groupFormData.is_recurring ? groupFormData.recurrence : null,
      expected_day_of_month:
        groupFormData.recurrence === 'monthly' && groupFormData.expected_day_of_month
          ? Number(groupFormData.expected_day_of_month)
          : null,
      expected_weekday: groupFormData.recurrence === 'weekly' ? groupFormData.expected_weekday || null : null,
    };
    try {
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showSuccess(`Group ${isEditing ? 'updated' : 'created'}`);
        closeGroupForm();
        await fetchGroups();
      } else {
        const err = await res.json();
        showError(`Failed to ${isEditing ? 'update' : 'create'} group`, err.detail || 'Unknown error');
      }
    } catch (error) {
      showError(`Failed to ${isEditing ? 'update' : 'create'} group`, error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDeleteGroup = async (g: ObligationGroup) => {
    const confirmed = await showConfirmDelete(
      'Delete Group',
      `Delete "${g.name}"? ${g.obligation_count} linked obligation(s) will be kept, just unlinked from this group.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`${GROUP_API}${g.obligation_group_id}/`, { method: 'DELETE' });
      if (res.ok) {
        showSuccess('Group deleted');
        await fetchGroups();
        await fetchAll();
      } else {
        showError('Failed to delete group');
      }
    } catch (error) {
      showError('Failed to delete group', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleSyncGroup = async (g: ObligationGroup) => {
    const confirmed = await showConfirm({
      title: 'Sync Group to Obligations',
      content: `Overwrite category/type/cadence on all ${g.obligation_count} obligation(s) linked to "${g.name}" with the group's current settings? This cannot be undone automatically.`,
      okText: 'Sync',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`${GROUP_API}${g.obligation_group_id}/sync/`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showSuccess(`Synced ${data.updated} obligation(s) to "${g.name}"`);
        await fetchAll();
      } else {
        showError('Failed to sync group', data.detail || 'Unknown error');
      }
    } catch (error) {
      showError('Failed to sync group', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // ── Occurrence actions ───────────────────────────────────────────────────

  const handleTogglePaid = async (occ: ObligationOccurrence) => {
    const action = occ.paid ? 'unmark-paid' : 'mark-paid';
    try {
      const res = await fetch(`${OCC_API}${occ.obligation_occurrence_id}/${action}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'mark-paid' ? JSON.stringify({}) : undefined,
      });
      if (res.ok) {
        await refreshDetail(occ.obligation_id);
      } else {
        showError('Failed to update paid status');
      }
    } catch (error) {
      showError('Failed to update paid status', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUpdatePaidDate = async (occ: ObligationOccurrence, newDate: string) => {
    try {
      const res = await fetch(`${OCC_API}${occ.obligation_occurrence_id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          due_date: occ.due_date,
          period: occ.period,
          estimated_amount: occ.estimated_amount,
          note: occ.note,
          paid_date: newDate || null,
        }),
      });
      if (res.ok) {
        await refreshDetail(occ.obligation_id);
      } else {
        showError('Failed to update paid date');
      }
    } catch (error) {
      showError('Failed to update paid date', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const openEditOccDialog = (occ: ObligationOccurrence, obligationHint?: Obligation) => {
    const ob = obligationHint || obligations.find((o) => o.obligation_id === occ.obligation_id);
    if (!ob) {
      showError('Could not find the parent obligation for this occurrence');
      return;
    }
    setEditOccDialog({ occ, obligation: ob });
    setOccFormData({
      period: occ.period || '',
      name: ob.name,
      category_id: ob.category_id ?? '',
      direction: ob.direction,
      obligation_group_id: ob.obligation_group_id ?? '',
      due_date: occ.due_date || '',
      paid_date: occ.paid_date || '',
      note: occ.note || '',
      estimated_amount: occ.estimated_amount !== null ? String(occ.estimated_amount) : '',
    });
  };

  const closeEditOccDialog = () => setEditOccDialog(null);

  const handleEditOccSubmit = async () => {
    if (!editOccDialog) return;
    if (!occFormData.name.trim()) {
      showError('Please enter a name');
      return;
    }
    const { occ, obligation: ob } = editOccDialog;
    try {
      const occRes = await fetch(`${OCC_API}${occ.obligation_occurrence_id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          due_date: occFormData.due_date || null,
          period: occFormData.period || null,
          estimated_amount: occFormData.estimated_amount ? Number(occFormData.estimated_amount) : null,
          note: occFormData.note || null,
          paid_date: occFormData.paid_date || null,
        }),
      });
      if (!occRes.ok) {
        const err = await occRes.json();
        showError('Failed to update occurrence', err.detail || 'Unknown error');
        return;
      }

      // name/category/type/group are shared across every sibling occurrence
      // of this Obligation by design (see ObligationGroup) -- editing them
      // here updates the Obligation itself, not just this one row. Every
      // other Obligation field is echoed back unchanged.
      const obRes = await fetch(`${API}${ob.obligation_id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: occFormData.name.trim(),
          category_id: occFormData.category_id ? Number(occFormData.category_id) : null,
          payee_id: ob.payee_id,
          obligation_group_id: occFormData.obligation_group_id ? Number(occFormData.obligation_group_id) : null,
          is_recurring: ob.is_recurring,
          recurrence: ob.recurrence,
          estimated_amount: ob.estimated_amount,
          note: ob.note,
          is_active: ob.is_active,
          direction: occFormData.direction,
        }),
      });
      if (!obRes.ok) {
        const err = await obRes.json();
        showError('Failed to update obligation', err.detail || 'Unknown error');
        return;
      }

      showSuccess('Occurrence updated');
      closeEditOccDialog();
      await fetchAll();
      await fetchDetail(occ.obligation_id);
      if (activeTab === 'occurrences') await fetchOccurrences();
    } catch (error) {
      showError('Failed to update occurrence', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUnblockOccurrence = async (occ: ObligationOccurrence) => {
    try {
      const res = await fetch(`${OCC_API}${occ.obligation_occurrence_id}/unblock/`, { method: 'POST' });
      if (res.ok) {
        await refreshDetail(occ.obligation_id);
      } else {
        showError('Failed to unblock occurrence');
      }
    } catch (error) {
      showError('Failed to unblock occurrence', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleDeleteOccurrence = async (occ: ObligationOccurrence) => {
    const confirmed = await showConfirmDelete('Delete Occurrence', `Delete the occurrence due ${occ.due_date ? formatDate(occ.due_date, defaultLocale) : '(no date)'}?`);
    if (!confirmed) return;
    try {
      const res = await fetch(`${OCC_API}${occ.obligation_occurrence_id}/`, { method: 'DELETE' });
      if (res.ok) {
        await refreshDetail(occ.obligation_id);
      } else {
        const err = await res.json();
        showError('Failed to delete occurrence', err.detail || 'Unknown error');
      }
    } catch (error) {
      showError('Failed to delete occurrence', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleGenerateNext = async (ob: Obligation) => {
    try {
      const res = await fetch(`${API}${ob.obligation_id}/generate-next-occurrence/`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showError('Failed to generate next occurrence', data.detail || 'Unknown error');
        return;
      }
      if (data.generated) {
        showSuccess(`Next occurrence created (due ${formatDate(data.occurrence.due_date, defaultLocale)})`);
        await refreshDetail(ob.obligation_id);
      } else {
        showSuccess(data.reason || 'Nothing to generate');
      }
    } catch (error) {
      showError('Failed to generate next occurrence', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // ── Assign transactions dialog ───────────────────────────────────────────

  const openAssignDialog = async (occ: ObligationOccurrence) => {
    setSearchForm(emptySearchForm);
    setAssignDialog({ occurrence: occ, assigned: [], candidates: [], selected: new Set(), loading: true, aiLoading: false, aiExplanation: null, searching: false });
    try {
      const [assignedRes, candidatesRes] = await Promise.all([
        fetch(`${OCC_API}${occ.obligation_occurrence_id}/assigned-transactions/`),
        fetch(`${OCC_API}${occ.obligation_occurrence_id}/candidate-transactions/`),
      ]);
      const assignedData = await assignedRes.json();
      const candidatesData = await candidatesRes.json();
      setAssignDialog((prev) =>
        prev
          ? { ...prev, assigned: assignedData.results || [], candidates: candidatesData.results || [], loading: false }
          : prev
      );
    } catch (error) {
      showError('Failed to load transactions', error instanceof Error ? error.message : 'Unknown error');
      setAssignDialog((prev) => (prev ? { ...prev, loading: false } : prev));
    }
  };

  const closeAssignDialog = () => setAssignDialog(null);

  const handleSearchCandidates = async () => {
    if (!assignDialog) return;
    setSearchingCandidates(true);
    try {
      const params = new URLSearchParams();
      if (searchForm.text.trim()) params.set('search', searchForm.text.trim());
      if (searchForm.minAmount) params.set('min_amount', searchForm.minAmount);
      if (searchForm.maxAmount) params.set('max_amount', searchForm.maxAmount);
      if (searchForm.allTime) params.set('all_time', 'true');
      if (searchForm.ignoreDirection) params.set('ignore_direction', 'true');

      const res = await fetch(
        `${OCC_API}${assignDialog.occurrence.obligation_occurrence_id}/candidate-transactions/?${params.toString()}`
      );
      const data = await res.json();
      if (!res.ok) {
        showError('Search failed', data.detail || 'Unknown error');
        return;
      }
      setAssignDialog((prev) => (prev ? { ...prev, candidates: data.results || [], searching: true } : prev));
    } catch (error) {
      showError('Search failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSearchingCandidates(false);
    }
  };

  const handleResetCandidateSearch = async () => {
    if (!assignDialog) return;
    setSearchForm(emptySearchForm);
    setSearchingCandidates(true);
    try {
      const res = await fetch(`${OCC_API}${assignDialog.occurrence.obligation_occurrence_id}/candidate-transactions/`);
      const data = await res.json();
      setAssignDialog((prev) => (prev ? { ...prev, candidates: data.results || [], searching: false } : prev));
    } catch (error) {
      showError('Failed to reset search', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSearchingCandidates(false);
    }
  };

  const toggleCandidate = (txId: number) => {
    setAssignDialog((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return { ...prev, selected: next };
    });
  };

  const handleAssignSelected = async () => {
    if (!assignDialog || assignDialog.selected.size === 0) return;
    const occ = assignDialog.occurrence;
    try {
      const res = await fetch(`${OCC_API}${occ.obligation_occurrence_id}/assign-transactions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ids: Array.from(assignDialog.selected) }),
      });
      if (res.ok) {
        showSuccess('Transaction(s) assigned');
        closeAssignDialog();
        await refreshDetail(occ.obligation_id);
      } else {
        const err = await res.json();
        showError('Failed to assign transactions', err.detail || 'Unknown error');
      }
    } catch (error) {
      showError('Failed to assign transactions', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUnassignOne = async (txId: number) => {
    if (!assignDialog) return;
    const occ = assignDialog.occurrence;
    try {
      const res = await fetch(`${OCC_API}${occ.obligation_occurrence_id}/unassign-transactions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ids: [txId] }),
      });
      if (res.ok) {
        setAssignDialog((prev) => (prev ? { ...prev, assigned: prev.assigned.filter((t) => t.transaction_id !== txId) } : prev));
        await refreshDetail(occ.obligation_id);
      } else {
        showError('Failed to unassign transaction');
      }
    } catch (error) {
      showError('Failed to unassign transaction', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleAiSuggestMatches = async () => {
    if (!assignDialog) return;
    setAssignDialog((prev) => (prev ? { ...prev, aiLoading: true } : prev));
    try {
      const res = await fetch(`${OCC_API}${assignDialog.occurrence.obligation_occurrence_id}/suggest-matches/`);
      const data = await res.json();
      if (!res.ok) {
        showError('AI matching failed', data.detail || 'Unknown error');
        setAssignDialog((prev) => (prev ? { ...prev, aiLoading: false } : prev));
        return;
      }
      const best = data.suggested_combinations?.[0] || data.suggested_single?.[0];
      setAssignDialog((prev) => {
        if (!prev) return prev;
        const selected = new Set(prev.selected);
        (best?.transaction_ids || []).forEach((id: number) => selected.add(id));
        return { ...prev, selected, aiLoading: false, aiExplanation: data.ai_explanation || (best ? `Suggested: ${best.transaction_ids.length} transaction(s) summing to ${formatAmount(best.total, defaultCurrencySymbol, defaultLocale)}` : 'No confident match found') };
      });
    } catch (error) {
      showError('AI matching failed', error instanceof Error ? error.message : 'Unknown error');
      setAssignDialog((prev) => (prev ? { ...prev, aiLoading: false } : prev));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Obligations</h1>
          <p className="text-muted-foreground text-sm">
            Budgeted bills tracked separately from the ledger — estimates, not transactions. Assign real
            transactions to cover them, and mark/unmark paid independently.
          </p>
        </div>
      </div>

      <TabProvider value={activeTab} onUpdate={(v) => setActiveTab(v as 'obligations' | 'occurrences')}>
        <TabList>
          <Tab value="obligations">Obligations</Tab>
          <Tab value="occurrences">Occurrences</Tab>
        </TabList>
      </TabProvider>

      <div className="flex justify-end gap-2">
        <Link to="/obligations/import">
          <Button view="normal">
            <Upload className="mr-2 h-4 w-4" />
            Import Spreadsheet
          </Button>
        </Link>
        <Button onClick={() => setIsGroupsModalOpen(true)}>
          <Layers className="mr-2 h-4 w-4" />
          Manage Groups{groups.length > 0 ? ` (${groups.length})` : ''}
        </Button>
        {activeTab === 'obligations' && (
          <>
            <Button onClick={() => setShowBlocked((v) => !v)}>
              {showBlocked ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showBlocked ? 'Hide' : 'Show'} Blocked{blockedCount > 0 ? ` (${blockedCount})` : ''}
            </Button>
            <Button onClick={() => setShowPaidNested((v) => !v)}>
              {showPaidNested ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showPaidNested ? 'Hide' : 'Show'} Paid
            </Button>
          </>
        )}
        {activeTab === 'occurrences' && (
          <Button onClick={() => setShowPaidOcc((v) => !v)}>
            {showPaidOcc ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {showPaidOcc ? 'Hide' : 'Show'} Paid
          </Button>
        )}
        <Button view="action" onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          New Obligation
        </Button>
      </div>

      {activeTab === 'occurrences' && (
        <div className="flex gap-3 items-end bg-card border border-border rounded-lg p-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Search</label>
            <TextInput placeholder="Name or note…" value={occSearch} onUpdate={setOccSearch} hasClear />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Status</label>
            <Select
              value={[occStatusFilter]}
              onUpdate={(val) => setOccStatusFilter((val[0] as 'all' | 'pending' | 'late') || 'all')}
              options={[
                { value: 'all', content: 'All (except hidden paid)' },
                { value: 'pending', content: 'Pending' },
                { value: 'late', content: 'Late' },
              ]}
              width={220}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Type</label>
            <Select
              value={[occDirection]}
              onUpdate={(val) => setOccDirection((val[0] as '' | 'payable' | 'receivable') || '')}
              options={[{ value: '', content: '(any type)' }, ...DIRECTION_OPTIONS]}
              width={200}
              hasClear
            />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Category</label>
            <Select
              value={occCategoryId ? [occCategoryId] : []}
              onUpdate={(val) => setOccCategoryId(val[0] || '')}
              options={[{ value: '', content: '(any category)' }, ...categoryOptions.slice(1)]}
              filterable
              hasClear
              width="max"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Month</label>
            <Select
              value={[occMonth]}
              onUpdate={(val) => setOccMonth(val[0] || '')}
              options={MONTH_OPTIONS}
              width={160}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Year</label>
            <TextInput
              type="number"
              placeholder="(any year)"
              value={occYear}
              onUpdate={setOccYear}
              style={{ width: 120 }}
            />
          </div>
        </div>
      )}

      {activeTab === 'occurrences' && selectedOccIds.size > 0 && (
        <div className="flex justify-between items-center bg-primary/5 border border-primary/20 rounded-lg p-2 px-3">
          <span className="text-sm font-medium">{selectedOccIds.size} selected</span>
          <Button view="flat-danger" size="s" onClick={handleBulkDeleteOccurrences}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete Selected
          </Button>
        </div>
      )}

      {activeTab === 'obligations' && (
      <div className="compact-table border border-border rounded-lg overflow-hidden bg-card shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="py-1 px-3 w-8" />
              <th className="py-1 px-3 text-base font-bold text-black">Name</th>
              <th className="py-1 px-3 text-base font-bold text-black">Category</th>
              <th className="py-1 px-3 text-base font-bold text-black">Type</th>
              <th className="py-1 px-3 text-base font-bold text-black">Cadence</th>
              <th className="py-1 px-3 text-base font-bold text-black text-right">Estimate</th>
              <th className="py-1 px-3 text-base font-bold text-black">Next Due</th>
              <th className="py-1 px-3 text-base font-bold text-black text-center">Open</th>
              <th className="py-1 px-3 text-base font-bold text-black w-40 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && obligations.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">Loading obligations...</td>
              </tr>
            ) : visibleObligations.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">No obligations found.</td>
              </tr>
            ) : (
              visibleObligations.map((ob, idx) => {
                const isExpanded = !!expandedIds[ob.obligation_id];
                const detail = detailsById[ob.obligation_id];
                const stripe = idx % 2 === 1;
                return (
                  <React.Fragment key={ob.obligation_id}>
                    <tr
                      className={`g-table__row border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${stripe ? 'bg-muted/40' : ''}`}
                      style={{ opacity: ob.is_blocked ? 0.7 : 1 }}
                      onClick={() => toggleExpand(ob)}
                    >
                      <td className="py-1 px-3 text-center">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="py-1 px-3">
                        <span className="font-semibold text-foreground text-sm">{ob.name}</span>
                        {ob.is_blocked && (
                          <span className="text-xs text-muted-foreground ml-2">
                            → duplicate of {ob.duplicate_of_obligation_name}
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-3 text-sm text-muted-foreground">{ob.category_name || '—'}</td>
                      <td className="py-1 px-3 text-sm text-muted-foreground">
                        {ob.direction === 'receivable' ? 'Receivable' : 'Payable'}
                      </td>
                      <td className="py-1 px-3 text-sm text-muted-foreground">
                        {ob.is_recurring ? ob.recurrence : 'one-off'}
                      </td>
                      <td className="py-1 px-3 text-sm text-right">{formatAmount(ob.estimated_amount, defaultCurrencySymbol, defaultLocale)}</td>
                      <td className="py-1 px-3 text-sm text-muted-foreground">{ob.next_due_date ? formatDate(ob.next_due_date, defaultLocale) : '—'}</td>
                      <td className="py-1 px-3 text-sm text-center">{ob.open_occurrence_count}</td>
                      <td className="py-1 px-3">
                        <div className="flex justify-center items-center space-x-1 min-h-[28px]">
                          {ob.is_blocked && (
                            <Button
                              view="flat"
                              title="Unblock"
                              onClick={(e) => { e.stopPropagation(); handleUnblockObligation(ob); }}
                            >
                              <Undo2 className="h-4 w-4 text-amber-600" />
                            </Button>
                          )}
                          <Button view="flat" title="Edit" onClick={(e) => { e.stopPropagation(); openEditModal(ob); }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button view="flat-danger" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(ob); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-b border-border/30 bg-muted/10">
                        <td />
                        <td colSpan={8} className="py-2 px-3">
                          {!detail ? (
                            <div className="text-sm text-muted-foreground py-2">Loading occurrences...</div>
                          ) : (
                            <div className="space-y-2">
                              {ob.is_recurring && (
                                <div className="flex justify-end">
                                  <Button view="flat" size="s" onClick={() => handleGenerateNext(ob)}>
                                    Generate Next Occurrence
                                  </Button>
                                </div>
                              )}
                              {(() => {
                                const allOccurrences = detail.occurrences || [];
                                const visibleOccurrences = allOccurrences.filter((occ) => showPaidNested || !occ.paid);
                                const hiddenPaidCount = allOccurrences.length - visibleOccurrences.length;
                                return (
                              <table className="w-full border-collapse text-left">
                                <thead>
                                  <tr className="border-b border-border/50">
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground">Due</th>
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground text-right">Estimate</th>
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground">Coverage</th>
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground text-center">Status</th>
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground text-center">Paid</th>
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground">Paid Date</th>
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground">Note</th>
                                    <th className="py-1 px-2 text-xs font-semibold text-muted-foreground text-center">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visibleOccurrences.map((occ) => (
                                    <tr key={occ.obligation_occurrence_id} className="border-b border-border/20" style={{ opacity: occ.is_blocked ? 0.7 : 1 }}>
                                      <td className="py-1 px-2 text-sm">{occ.due_date ? formatDate(occ.due_date, defaultLocale) : '—'}</td>
                                      <td className="py-1 px-2 text-sm text-right">{formatAmount(occ.estimated_amount, defaultCurrencySymbol, defaultLocale)}</td>
                                      <td className="py-1 px-2 text-sm text-muted-foreground">
                                        {formatAmount(occ.assigned_total, defaultCurrencySymbol, defaultLocale)} / {formatAmount(occ.estimated_amount, defaultCurrencySymbol, defaultLocale)}
                                        {occ.assigned_transaction_count > 0 && ` (${occ.assigned_transaction_count} txn)`}
                                        {occ.is_blocked && <span className="ml-2"><BlockedBadge /></span>}
                                      </td>
                                      <td className="py-1 px-2 text-center">
                                        <StatusBadge occ={occ} />
                                      </td>
                                      <td className="py-1 px-2 text-center">
                                        <Checkbox checked={occ.paid} onUpdate={() => handleTogglePaid(occ)} />
                                      </td>
                                      <td className="py-1 px-2">
                                        <input
                                          type="date"
                                          className="border rounded p-1 text-xs bg-background text-foreground w-full"
                                          value={occ.paid_date || ''}
                                          onChange={(e) => handleUpdatePaidDate(occ, e.target.value)}
                                        />
                                      </td>
                                      <td className="py-1 px-2 text-sm text-muted-foreground">{occ.note || ''}</td>
                                      <td className="py-1 px-2">
                                        <div className="flex justify-center items-center gap-1">
                                          <Button view="flat" size="s" title="Edit" onClick={() => openEditOccDialog(occ, detail)}>
                                            <Edit2 className="h-4 w-4" />
                                          </Button>
                                          <Button view="flat" size="s" title="Assign Transactions" onClick={() => openAssignDialog(occ)}>
                                            <Link2 className="h-4 w-4" />
                                          </Button>
                                          {occ.is_blocked && (
                                            <Button view="flat" size="s" title="Unblock" onClick={() => handleUnblockOccurrence(occ)}>
                                              <Undo2 className="h-4 w-4 text-amber-600" />
                                            </Button>
                                          )}
                                          <Button view="flat-danger" size="s" title="Delete" onClick={() => handleDeleteOccurrence(occ)}>
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {visibleOccurrences.length === 0 && (
                                    <tr>
                                      <td colSpan={8} className="py-3 text-center text-sm text-muted-foreground">
                                        {allOccurrences.length === 0
                                          ? 'No occurrences.'
                                          : `All ${hiddenPaidCount} occurrence(s) are paid — click "Show Paid" to see them.`}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {activeTab === 'occurrences' && (
        <div className="compact-table border border-border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="py-1 px-3 w-8">
                  {occurrences.length > 0 && (
                    <Checkbox
                      checked={selectedOccIds.size === occurrences.length}
                      indeterminate={selectedOccIds.size > 0 && selectedOccIds.size < occurrences.length}
                      onUpdate={toggleAllOccSelected}
                    />
                  )}
                </th>
                <th className="py-1 px-3 text-base font-bold text-black">Month/Year</th>
                <th className="py-1 px-3 text-base font-bold text-black">Name</th>
                <th className="py-1 px-3 text-base font-bold text-black">Category</th>
                <th className="py-1 px-3 text-base font-bold text-black">Type</th>
                <th className="py-1 px-3 text-base font-bold text-black">Due</th>
                <th className="py-1 px-3 text-base font-bold text-black text-center">Status</th>
                <th className="py-1 px-3 text-base font-bold text-black text-center">Paid</th>
                <th className="py-1 px-3 text-base font-bold text-black">Paid Date</th>
                <th className="py-1 px-3 text-base font-bold text-black">Note</th>
                <th className="py-1 px-3 text-base font-bold text-black w-36 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {occLoading && occurrences.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-muted-foreground">Loading occurrences...</td>
                </tr>
              ) : occurrences.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-muted-foreground">No occurrences match these filters.</td>
                </tr>
              ) : (
                occurrences.map((occ, idx) => (
                  <tr
                    key={occ.obligation_occurrence_id}
                    className={`border-b border-border/50 ${idx % 2 === 1 ? 'bg-muted/40' : ''}`}
                    style={{ opacity: occ.is_blocked ? 0.7 : 1 }}
                  >
                    <td className="py-1 px-3 text-center">
                      <Checkbox
                        checked={selectedOccIds.has(occ.obligation_occurrence_id)}
                        onUpdate={() => toggleOccSelected(occ.obligation_occurrence_id)}
                      />
                    </td>
                    <td className="py-1 px-3 text-sm text-muted-foreground">{occ.period || '—'}</td>
                    <td className="py-1 px-3 text-sm font-medium text-foreground">{occ.obligation_name}</td>
                    <td className="py-1 px-3 text-sm text-muted-foreground">{occ.category_name || '—'}</td>
                    <td className="py-1 px-3 text-sm text-muted-foreground">{occ.direction === 'receivable' ? 'Receivable' : 'Payable'}</td>
                    <td className="py-1 px-3 text-sm">{occ.due_date ? formatDate(occ.due_date, defaultLocale) : '—'}</td>
                    <td className="py-1 px-3 text-center"><StatusBadge occ={occ} /></td>
                    <td className="py-1 px-3 text-center">
                      <Checkbox checked={occ.paid} onUpdate={() => handleTogglePaid(occ)} />
                    </td>
                    <td className="py-1 px-3">
                      <input
                        type="date"
                        className="border rounded p-1 text-xs bg-background text-foreground w-full"
                        value={occ.paid_date || ''}
                        onChange={(e) => handleUpdatePaidDate(occ, e.target.value)}
                      />
                    </td>
                    <td className="py-1 px-3 text-sm text-muted-foreground">{occ.note || ''}</td>
                    <td className="py-1 px-3">
                      <div className="flex justify-center items-center gap-1">
                        <Button view="flat" size="s" title="Edit" onClick={() => openEditOccDialog(occ)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button view="flat" size="s" title="Assign Transactions" onClick={() => openAssignDialog(occ)}>
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button view="flat-danger" size="s" title="Delete" onClick={() => handleDeleteOccurrence(occ)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      <Dialog open={isModalOpen} onClose={closeModal}>
        <Dialog.Header caption={editingObligation ? 'Edit Obligation' : 'New Obligation'} />
        <Dialog.Body>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <TextInput value={formData.name} onUpdate={(val) => setFormData({ ...formData, name: val })} />
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Category</label>
                <Select
                  value={formData.category_id ? [String(formData.category_id)] : ['']}
                  onUpdate={(val) => setFormData({ ...formData, category_id: val[0] || '' })}
                  options={categoryOptions}
                  filterable
                  width="max"
                />
              </div>
              <Button loading={aiSuggesting} onClick={handleAiSuggestCategory} title="AI Suggest Category">
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Payee (optional)</label>
              <Select
                value={formData.payee_id ? [String(formData.payee_id)] : ['']}
                onUpdate={(val) => setFormData({ ...formData, payee_id: val[0] || '' })}
                options={payeeOptions}
                filterable
                width="max"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Group (optional) <span className="text-muted-foreground font-normal">— shares a recurring template across separate imports</span>
              </label>
              <Select
                value={formData.obligation_group_id ? [String(formData.obligation_group_id)] : ['']}
                onUpdate={(val) => setFormData({ ...formData, obligation_group_id: val[0] || '' })}
                options={groupOptions}
                filterable
                width="max"
                hasClear
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <Select
                value={[formData.direction]}
                onUpdate={(val) => setFormData({ ...formData, direction: (val[0] as 'payable' | 'receivable') || 'payable' })}
                options={DIRECTION_OPTIONS}
                width="max"
              />
            </div>
            <div className="flex gap-3 items-end">
              <Checkbox
                checked={formData.is_recurring}
                onUpdate={(checked) => setFormData({ ...formData, is_recurring: checked })}
              >
                Recurring
              </Checkbox>
              {formData.is_recurring && (
                <Select
                  value={[formData.recurrence]}
                  onUpdate={(val) => setFormData({ ...formData, recurrence: val[0] || 'monthly' })}
                  options={RECURRENCE_OPTIONS}
                  width={160}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Estimated Amount</label>
              <TextInput
                type="number"
                value={formData.estimated_amount}
                onUpdate={(val) => setFormData({ ...formData, estimated_amount: val })}
              />
            </div>
            {!editingObligation && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">First Due Date</label>
                  <input
                    type="date"
                    className="border rounded p-1.5 text-sm bg-background text-foreground w-full"
                    value={formData.first_due_date}
                    onChange={(e) => setFormData({ ...formData, first_due_date: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">First Amount (optional)</label>
                  <TextInput
                    type="number"
                    placeholder="Same as estimate"
                    value={formData.first_amount}
                    onUpdate={(val) => setFormData({ ...formData, first_amount: val })}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Note</label>
              <TextInput value={formData.note} onUpdate={(val) => setFormData({ ...formData, note: val })} />
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer
          preset="default"
          onClickButtonCancel={closeModal}
          onClickButtonApply={handleSubmit}
          textButtonApply={editingObligation ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>

      {/* Assign transactions modal */}
      <Dialog open={!!assignDialog} onClose={closeAssignDialog} size="l">
        <Dialog.Header
          caption={assignDialog ? `Assign Transactions — ${assignDialog.occurrence.obligation_name} (${assignDialog.occurrence.due_date ? formatDate(assignDialog.occurrence.due_date, defaultLocale) : 'no date'})` : ''}
        />
        <Dialog.Body>
          {assignDialog && (
            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Estimate: {formatAmount(assignDialog.occurrence.estimated_amount, defaultCurrencySymbol, defaultLocale)} · Currently assigned:{' '}
                  {formatAmount(assignDialog.occurrence.assigned_total, defaultCurrencySymbol, defaultLocale)}
                </span>
                <Button loading={assignDialog.aiLoading} view="normal" onClick={handleAiSuggestMatches}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Suggest Matches
                </Button>
              </div>
              {assignDialog.aiExplanation && (
                <div className="text-sm bg-primary/5 border border-primary/20 rounded p-2">{assignDialog.aiExplanation}</div>
              )}

              {assignDialog.assigned.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">Assigned</div>
                  <div className="border border-border rounded divide-y divide-border/50">
                    {assignDialog.assigned.map((tx) => (
                      <div key={tx.transaction_id} className="flex justify-between items-center px-2 py-1 text-sm">
                        <span className="flex items-center gap-2">
                          <span>{formatDate(tx.date, defaultLocale)} · {tx.payee_name || tx.comment || '—'}</span>
                          <AccountBadge name={tx.account_name} />
                          <SignedAmount amount={tx.amount} currencySymbol={tx.currency_symbol} locale={defaultLocale} />
                        </span>
                        <Button view="flat" size="s" onClick={() => handleUnassignOne(tx.transaction_id)}>
                          Unassign
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-muted/20 border border-border rounded p-2 space-y-2">
                <div className="text-sm font-semibold">Can't find it? Search beyond the suggestions</div>
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-muted-foreground mb-1">Comment or payee</label>
                    <TextInput
                      value={searchForm.text}
                      onUpdate={(val) => setSearchForm({ ...searchForm, text: val })}
                      placeholder="e.g. refund"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Min amount</label>
                    <TextInput
                      type="number"
                      value={searchForm.minAmount}
                      onUpdate={(val) => setSearchForm({ ...searchForm, minAmount: val })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Max amount</label>
                    <TextInput
                      type="number"
                      value={searchForm.maxAmount}
                      onUpdate={(val) => setSearchForm({ ...searchForm, maxAmount: val })}
                      style={{ width: 100 }}
                    />
                  </div>
                  <Checkbox
                    checked={searchForm.allTime}
                    onUpdate={(checked) => setSearchForm({ ...searchForm, allTime: checked })}
                  >
                    Any date
                  </Checkbox>
                  <Checkbox
                    checked={searchForm.ignoreDirection}
                    onUpdate={(checked) => setSearchForm({ ...searchForm, ignoreDirection: checked })}
                  >
                    Any type (in or out)
                  </Checkbox>
                  <Button view="action" size="s" loading={searchingCandidates} onClick={handleSearchCandidates}>
                    Search
                  </Button>
                  {assignDialog.searching && (
                    <Button view="flat" size="s" onClick={handleResetCandidateSearch}>
                      Reset to Suggested
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-1">
                  {assignDialog.searching ? 'Search Results' : 'Candidates'}
                </div>
                {assignDialog.loading ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">Loading candidates...</div>
                ) : assignDialog.candidates.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    {assignDialog.searching
                      ? 'No transactions match this search.'
                      : 'No candidate transactions found in the default date window.'}
                  </div>
                ) : (
                  <div className="border border-border rounded divide-y divide-border/50 max-h-80 overflow-y-auto">
                    {assignDialog.candidates.map((tx) => (
                      <label key={tx.transaction_id} className="flex justify-between items-center px-2 py-1 text-sm cursor-pointer hover:bg-muted/20">
                        <span className="flex items-center gap-2">
                          <Checkbox
                            checked={assignDialog.selected.has(tx.transaction_id)}
                            onUpdate={() => toggleCandidate(tx.transaction_id)}
                          />
                          <span>{formatDate(tx.date, defaultLocale)} · {tx.payee_name || tx.comment || '—'}</span>
                          <AccountBadge name={tx.account_name} />
                        </span>
                        <SignedAmount amount={tx.amount} currencySymbol={tx.currency_symbol} locale={defaultLocale} />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Dialog.Body>
        <Dialog.Footer
          preset="default"
          onClickButtonCancel={closeAssignDialog}
          onClickButtonApply={handleAssignSelected}
          textButtonApply="Assign Selected"
          textButtonCancel="Close"
          propsButtonApply={{ disabled: !assignDialog || assignDialog.selected.size === 0 }}
        />
      </Dialog>

      {/* Groups management modal */}
      <Dialog open={isGroupsModalOpen} onClose={() => setIsGroupsModalOpen(false)} size="l">
        <Dialog.Header caption="Obligation Groups" />
        <Dialog.Body>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              A group is a reusable recurring-bill template (name, category, type, cadence). Separate obligations
              (e.g. one per import) can link to the same group instead of each carrying its own copy of these
              settings — editing a group never changes obligations already linked to it; use "Sync" to push the
              group's current settings down on demand.
            </p>
            <div className="flex justify-end">
              <Button view="action" size="s" onClick={openCreateGroupForm}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Group
              </Button>
            </div>
            <div className="border border-border rounded divide-y divide-border/50 max-h-96 overflow-y-auto">
              {groups.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No groups yet.</div>
              ) : (
                groups.map((g) => (
                  <div key={g.obligation_group_id} className="flex justify-between items-center px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-foreground">{g.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.category_name || 'No category'} · {g.direction === 'receivable' ? 'Receivable' : 'Payable'}
                        {g.recurrence ? ` · ${g.recurrence}` : ''}
                        {g.expected_day_of_month ? ` · day ${g.expected_day_of_month}` : ''}
                        {g.expected_weekday ? ` · ${g.expected_weekday}` : ''}
                        {' · '}{g.obligation_count} linked obligation{g.obligation_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        view="flat"
                        size="s"
                        title="Sync group settings to its obligations"
                        onClick={() => handleSyncGroup(g)}
                        disabled={g.obligation_count === 0}
                      >
                        Sync
                      </Button>
                      <Button view="flat" size="s" title="Edit" onClick={() => openEditGroupForm(g)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button view="flat-danger" size="s" title="Delete" onClick={() => handleDeleteGroup(g)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer preset="default" onClickButtonCancel={() => setIsGroupsModalOpen(false)} textButtonCancel="Close" />
      </Dialog>

      {/* Group create/edit sub-form */}
      <Dialog open={isGroupFormOpen} onClose={closeGroupForm}>
        <Dialog.Header caption={editingGroup ? 'Edit Group' : 'New Group'} />
        <Dialog.Body>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <TextInput value={groupFormData.name} onUpdate={(val) => setGroupFormData({ ...groupFormData, name: val })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <Select
                value={groupFormData.category_id ? [String(groupFormData.category_id)] : ['']}
                onUpdate={(val) => setGroupFormData({ ...groupFormData, category_id: val[0] || '' })}
                options={categoryOptions}
                filterable
                width="max"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <Select
                value={[groupFormData.direction]}
                onUpdate={(val) => setGroupFormData({ ...groupFormData, direction: (val[0] as 'payable' | 'receivable') || 'payable' })}
                options={DIRECTION_OPTIONS}
                width="max"
              />
            </div>
            <div className="flex gap-3 items-end">
              <Checkbox
                checked={groupFormData.is_recurring}
                onUpdate={(checked) => setGroupFormData({ ...groupFormData, is_recurring: checked })}
              >
                Recurring
              </Checkbox>
              {groupFormData.is_recurring && (
                <Select
                  value={[groupFormData.recurrence]}
                  onUpdate={(val) => setGroupFormData({ ...groupFormData, recurrence: val[0] || 'monthly' })}
                  options={RECURRENCE_OPTIONS}
                  width={160}
                />
              )}
            </div>
            {groupFormData.is_recurring && groupFormData.recurrence === 'monthly' && (
              <div>
                <label className="block text-sm font-medium mb-1">Expected day of month (optional)</label>
                <TextInput
                  type="number"
                  placeholder="e.g. 15"
                  value={groupFormData.expected_day_of_month}
                  onUpdate={(val) => setGroupFormData({ ...groupFormData, expected_day_of_month: val })}
                />
              </div>
            )}
            {groupFormData.is_recurring && groupFormData.recurrence === 'weekly' && (
              <div>
                <label className="block text-sm font-medium mb-1">Expected weekday (optional)</label>
                <Select
                  value={groupFormData.expected_weekday ? [groupFormData.expected_weekday] : ['']}
                  onUpdate={(val) => setGroupFormData({ ...groupFormData, expected_weekday: val[0] || '' })}
                  options={[
                    { value: '', content: '(none)' },
                    ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => ({
                      value: d,
                      content: d.charAt(0).toUpperCase() + d.slice(1),
                    })),
                  ]}
                  width={200}
                />
              </div>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          preset="default"
          onClickButtonCancel={closeGroupForm}
          onClickButtonApply={handleGroupSubmit}
          textButtonApply={editingGroup ? 'Update' : 'Create'}
          textButtonCancel="Cancel"
        />
      </Dialog>

      {/* Edit Occurrence modal -- name/category/type/group edit the parent Obligation */}
      <Dialog open={!!editOccDialog} onClose={closeEditOccDialog}>
        <Dialog.Header caption="Edit Occurrence" />
        <Dialog.Body>
          {editOccDialog && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                Name, category, type and group are shared with every other occurrence of this obligation — changing
                them here changes the obligation itself, not just this one.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <TextInput value={occFormData.name} onUpdate={(val) => setOccFormData({ ...occFormData, name: val })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <Select
                  value={occFormData.category_id ? [String(occFormData.category_id)] : ['']}
                  onUpdate={(val) => setOccFormData({ ...occFormData, category_id: val[0] || '' })}
                  options={categoryOptions}
                  filterable
                  width="max"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <Select
                    value={[occFormData.direction]}
                    onUpdate={(val) => setOccFormData({ ...occFormData, direction: (val[0] as 'payable' | 'receivable') || 'payable' })}
                    options={DIRECTION_OPTIONS}
                    width="max"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Group</label>
                  <Select
                    value={occFormData.obligation_group_id ? [String(occFormData.obligation_group_id)] : ['']}
                    onUpdate={(val) => setOccFormData({ ...occFormData, obligation_group_id: val[0] || '' })}
                    options={groupOptions}
                    filterable
                    hasClear
                    width="max"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Due Date</label>
                  <input
                    type="date"
                    className="border rounded p-1.5 text-sm bg-background text-foreground w-full"
                    value={occFormData.due_date}
                    onChange={(e) => setOccFormData({ ...occFormData, due_date: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Month/Year</label>
                  <input
                    type="month"
                    className="border rounded p-1.5 text-sm bg-background text-foreground w-full"
                    value={occFormData.period}
                    onChange={(e) => setOccFormData({ ...occFormData, period: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Value</label>
                  <TextInput
                    type="number"
                    value={occFormData.estimated_amount}
                    onUpdate={(val) => setOccFormData({ ...occFormData, estimated_amount: val })}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Paid Date</label>
                  <input
                    type="date"
                    className="border rounded p-1.5 text-sm bg-background text-foreground w-full"
                    value={occFormData.paid_date}
                    onChange={(e) => setOccFormData({ ...occFormData, paid_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Note</label>
                <TextInput value={occFormData.note} onUpdate={(val) => setOccFormData({ ...occFormData, note: val })} />
              </div>
            </div>
          )}
        </Dialog.Body>
        <Dialog.Footer
          preset="default"
          onClickButtonCancel={closeEditOccDialog}
          onClickButtonApply={handleEditOccSubmit}
          textButtonApply="Save"
          textButtonCancel="Cancel"
        />
      </Dialog>
    </div>
  );
}
