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
