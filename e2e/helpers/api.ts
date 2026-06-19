/**
 * Direct DRF API client for seeding and cleaning E2E test data.
 * Bypasses the frontend entirely — talks to Django on :8000.
 */

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:8000';
const ACCOUNTS_API = `${API_BASE}/api/accounts`;

// ---------------------------------------------------------------------------
// Generic request helper
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const url = path.startsWith('http') ? path : `${ACCOUNTS_API}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  // DELETE returns 204 No Content
  if (res.status === 204) {
    return { status: 204, data: {} as T };
  }

  const data = (await res.json()) as T;
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Unwrap helpers — extract array from paginated or plain responses
// ---------------------------------------------------------------------------

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null && 'results' in data) {
    return (data as { results: T[] }).results;
  }
  return [];
}

/**
 * Fetch ALL records across paginated DRF responses.
 * Follows `next` links until exhausted.
 */
async function fetchAllPages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = path.startsWith('http') ? path : `${ACCOUNTS_API}${path}`;

  while (url) {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();

    if (Array.isArray(data)) {
      all.push(...(data as T[]));
      break;
    }

    if (typeof data === 'object' && data !== null && 'results' in data) {
      all.push(...(data as { results: T[]; next: string | null }).results);
      url = (data as { next: string | null }).next;
    } else {
      break;
    }
  }

  return all;
}

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

export interface CurrencyPayload {
  name: string;
  iso_code: string;
  symbol: string;
  order: number;
}

export interface Currency extends CurrencyPayload {
  currency_id: number;
}

export async function createCurrency(data: CurrencyPayload): Promise<Currency> {
  const res = await apiRequest<Currency>('POST', '/currencies/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createCurrency failed: ${res.status}`);
  return res.data;
}

export async function deleteCurrency(id: number): Promise<void> {
  await apiRequest('DELETE', `/currencies/${id}/`);
}

export async function listCurrencies(): Promise<Currency[]> {
  const res = await apiRequest('GET', '/currencies/');
  return unwrapList<Currency>(res.data);
}

// ---------------------------------------------------------------------------
// Titulars
// ---------------------------------------------------------------------------

export interface TitularPayload {
  name: string;
}

export interface Titular extends TitularPayload {
  titular_id: number;
}

export async function createTitular(data: TitularPayload): Promise<Titular> {
  const res = await apiRequest<Titular>('POST', '/titulars/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createTitular failed: ${res.status}`);
  return res.data;
}

export async function deleteTitular(id: number): Promise<void> {
  await apiRequest('DELETE', `/titulars/${id}/`);
}

export async function listTitulars(): Promise<Titular[]> {
  const res = await apiRequest('GET', '/titulars/');
  return unwrapList<Titular>(res.data);
}

// ---------------------------------------------------------------------------
// Account Holders
// ---------------------------------------------------------------------------

export interface AccountHolderPayload {
  name: string;
  comments?: string;
}

export interface AccountHolder extends AccountHolderPayload {
  account_holder_id: number;
}

export async function createAccountHolder(data: AccountHolderPayload): Promise<AccountHolder> {
  const res = await apiRequest<AccountHolder>('POST', '/account-holders/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createAccountHolder failed: ${res.status}`);
  return res.data;
}

export async function deleteAccountHolder(id: number): Promise<void> {
  await apiRequest('DELETE', `/account-holders/${id}/`);
}

export async function listAccountHolders(): Promise<AccountHolder[]> {
  const res = await apiRequest('GET', '/account-holders/');
  return unwrapList<AccountHolder>(res.data);
}

// ---------------------------------------------------------------------------
// Account Types
// ---------------------------------------------------------------------------

export interface AccountTypePayload {
  name: string;
  code: number;
}

export interface AccountType extends AccountTypePayload {
  account_type_id: number;
}

export async function createAccountType(data: AccountTypePayload): Promise<AccountType> {
  const res = await apiRequest<AccountType>('POST', '/account-types/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createAccountType failed: ${res.status}`);
  return res.data;
}

export async function deleteAccountType(id: number): Promise<void> {
  await apiRequest('DELETE', `/account-types/${id}/`);
}

export async function listAccountTypes(): Promise<AccountType[]> {
  const res = await apiRequest('GET', '/account-types/');
  return unwrapList<AccountType>(res.data);
}

// ---------------------------------------------------------------------------
// Account Groups
// ---------------------------------------------------------------------------

export interface AccountGroupPayload {
  name: string;
  is_hidden?: boolean;
}

export interface AccountGroup extends AccountGroupPayload {
  account_group_id: number;
}

export async function createAccountGroup(data: AccountGroupPayload): Promise<AccountGroup> {
  const res = await apiRequest<AccountGroup>('POST', '/account-groups/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createAccountGroup failed: ${res.status}`);
  return res.data;
}

export async function deleteAccountGroup(id: number): Promise<void> {
  await apiRequest('DELETE', `/account-groups/${id}/`);
}

export async function listAccountGroups(): Promise<AccountGroup[]> {
  const res = await apiRequest('GET', '/account-groups/');
  return unwrapList<AccountGroup>(res.data);
}

// ---------------------------------------------------------------------------
// Payees
// ---------------------------------------------------------------------------

export interface PayeePayload {
  name: string;
  comment?: string;
}

export interface Payee extends PayeePayload {
  payee_id: number;
}

export async function createPayee(data: PayeePayload): Promise<Payee> {
  const res = await apiRequest<Payee>('POST', '/payees/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createPayee failed: ${res.status}`);
  return res.data;
}

export async function deletePayee(id: number): Promise<void> {
  await apiRequest('DELETE', `/payees/${id}/`);
}

export async function listPayees(): Promise<Payee[]> {
  return fetchAllPages<Payee>('/payees/');
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryPayload {
  name: string;
  parent_category_id?: number | null;
  is_hidden?: boolean;
}

export interface Category extends CategoryPayload {
  category_id: number;
}

export async function createCategory(data: CategoryPayload): Promise<Category> {
  const res = await apiRequest<Category>('POST', '/categories/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createCategory failed: ${res.status}`);
  return res.data;
}

export async function deleteCategory(id: number): Promise<void> {
  await apiRequest('DELETE', `/categories/${id}/`);
}

export async function listCategories(params?: string): Promise<Category[]> {
  const qs = params ? `?${params}` : '';
  const res = await apiRequest('GET', `/categories/${qs}`);
  return unwrapList<Category>(res.data);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface AccountPayload {
  name: string;
  titular_id: number;
  account_holder_id?: number;
  account_type_id: number;
  sort_code?: string;
  number?: string;
  branch?: string;
  currency_id: number;
  is_closed?: boolean;
  entry: string;
  comment?: string;
  is_hidden?: boolean;
  groups?: Array<{ account_group_id: number; name: string }>;
}

export interface Account extends AccountPayload {
  account_id: number;
  titular_name: string;
  account_holder_name?: string;
  account_type_name: string;
  currency_name: string;
  currency_symbol: string;
  display_name: string;
  is_active: boolean;
  groups_display: Array<{ account_group_id: number; name: string }>;
  balance: number;
}

export async function createAccount(data: AccountPayload): Promise<Account> {
  const res = await apiRequest<Account>('POST', '/', data as unknown as Record<string, unknown>);
  if (res.status !== 201) throw new Error(`createAccount failed: ${res.status}`);
  return res.data;
}

export async function deleteAccount(id: number): Promise<void> {
  await apiRequest('DELETE', `/${id}/`);
}

export async function listAccounts(): Promise<Account[]> {
  const res = await apiRequest('GET', '/');
  return unwrapList<Account>(res.data);
}
