export * from './navigation';

export interface ImportPlan {
  import_plan_id: number;
  name: string;
  account_id?: number;
  account_name?: string; // From account's __str__ method
  import_csv_id: number;
  import_csv_name: string;
  rules: ImportPlanRule[];
  rules_count?: number;
}

export interface ImportPlanRule {
  import_plan_rule_id: number;
  import_plan_id: number;
  account_name: string;
  import_csv_field_id: number;
  import_csv_field_name: string;
  pattern: string;
  order: number;
  ignore: boolean;
  match_type: string;
  payee_id?: number;
  payee_name?: string;
  category_id?: number;
  category_name?: string;
  to_account_id?: number;
  to_account_name?: string;
}

export interface ImportPlanField {
  import_csv_field_id: number;
  name: string;
  map_field: string;
  type_field: string;
  format_field: string;
}

export interface Category {
  category_id: number;
  name: string;
  parent_category_id?: number;
  is_hidden: bool;
  order: number;
}

export interface Account {
  account_id: number;
  name: string;
  display_name: string;
  string_name: string; // From model's __str__ method
  titular_id?: number;
  titular_name?: string;
  account_holder_id?: number;
  account_holder_name?: string;
  currency_id?: number;
  currency_name?: string;
  currency_symbol?: string;
  currency_iso_code?: string;
  currency_string?: string;
  account_type_id?: number;
  account_type_name?: string;
  balance?: number;
  is_closed?: boolean;
  is_hidden?: boolean;
  order?: number;
}

export interface Payee {
  payee_id: number;
  name: string;
}

export type ObligationDirection = 'payable' | 'receivable';

export interface ObligationOccurrence {
  obligation_occurrence_id: number;
  obligation_id: number;
  obligation_name: string;
  due_date: string | null;
  period: string | null;
  estimated_amount: number | null;
  paid: boolean;
  paid_at: string | null;
  paid_date: string | null;
  note: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  duplicate_of_occurrence_id: number | null;
  source: string;
  created_at: string;
  assigned_total: number;
  assigned_transaction_count: number;
  category_id: number | null;
  category_name: string | null;
  payee_id: number | null;
  payee_name: string | null;
  direction: ObligationDirection;
}

export interface Obligation {
  obligation_id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  payee_id: number | null;
  payee_name: string | null;
  obligation_group_id: number | null;
  obligation_group_name: string | null;
  is_recurring: boolean;
  recurrence: string | null;
  estimated_amount: number | null;
  direction: ObligationDirection;
  note: string | null;
  is_active: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  duplicate_of_obligation_id: number | null;
  duplicate_of_obligation_name: string | null;
  source: string;
  created_at: string;
  occurrence_count: number;
  open_occurrence_count: number;
  next_due_date: string | null;
  occurrences?: ObligationOccurrence[];
}

export interface ObligationGroup {
  obligation_group_id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  direction: ObligationDirection;
  recurrence: string | null;
  expected_day_of_month: number | null;
  expected_weekday: string | null;
  created_at: string;
  obligation_count: number;
}

export interface ObligationImportFormatField {
  obligation_import_format_field_id?: number;
  target_field: string;
  source_column: string;
}

export interface ObligationImportFormat {
  obligation_import_format_id: number;
  name: string;
  file_type: string;
  sheet_name: string | null;
  header_row: number;
  date_format: string | null;
  decimal_separator: string;
  default_recurrence: string | null;
  default_category_id: number | null;
  fields: ObligationImportFormatField[];
}
