/**
 * Shared locator factories for GravityUI and Radix UI components.
 * Centralises selector knowledge so specs stay declarative.
 */

import { type Page, type Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// GravityUI Dialog
// ---------------------------------------------------------------------------

/** The currently open GravityUI Dialog overlay. */
export function gravityDialog(page: Page): Locator {
  return page.locator('.g-dialog');
}

/** The "Apply" / submit button inside a GravityUI Dialog footer. */
export function gravityDialogApply(page: Page, text?: string): Locator {
  const dialog = gravityDialog(page);
  if (text) {
    return dialog.getByRole('button', { name: text });
  }
  // Default: the primary action button in the footer
  return dialog.locator('.g-dialog-footer .g-dialog-btn-apply button, .g-dialog-footer button.g-button_view_action').first();
}

/** The "Cancel" button inside a GravityUI Dialog footer. */
export function gravityDialogCancel(page: Page): Locator {
  return gravityDialog(page).getByRole('button', { name: 'Cancel' });
}

// ---------------------------------------------------------------------------
// GravityUI TextInput
// ---------------------------------------------------------------------------

/** GravityUI TextInput control — the actual <input> element. */
export function gravityTextInput(parent: Locator): Locator {
  return parent.locator('.g-text-input__control');
}

/** GravityUI TextArea control. */
export function gravityTextArea(parent: Locator): Locator {
  return parent.locator('.g-text-area__control');
}

// ---------------------------------------------------------------------------
// GravityUI Checkbox
// ---------------------------------------------------------------------------

/** GravityUI Checkbox — the clickable label wrapper. */
export function gravityCheckbox(parent: Locator, label: string): Locator {
  return parent.locator('.g-checkbox').filter({ hasText: label });
}

// ---------------------------------------------------------------------------
// GravityUI Table
// ---------------------------------------------------------------------------

/** All data rows in a GravityUI Table. */
export function gravityTableRows(page: Page): Locator {
  return page.locator('.g-table__row');
}

/** A specific table row containing the given text. */
export function gravityTableRowByText(page: Page, text: string): Locator {
  return page.locator('.g-table__row').filter({ hasText: text });
}

// ---------------------------------------------------------------------------
// GravityUI Toast
// ---------------------------------------------------------------------------

/** Locator for the GravityUI Toaster container. */
export function toastContainer(page: Page): Locator {
  return page.locator('.g-toaster');
}

/** A specific toast notification matching text. */
export function toastByText(page: Page, text: string): Locator {
  return page.locator('.g-toast').filter({ hasText: text });
}

// ---------------------------------------------------------------------------
// Radix Dialog (used in AccountModal, Settings)
// ---------------------------------------------------------------------------

/** The currently open Radix Dialog. */
export function radixDialog(page: Page): Locator {
  return page.locator('[role="dialog"]');
}

// ---------------------------------------------------------------------------
// Radix Select
// ---------------------------------------------------------------------------

/** Click a Radix Select trigger to open the dropdown. */
export function radixSelectTrigger(parent: Locator, label: string): Locator {
  // Find the label, then locate the adjacent combobox trigger
  return parent.locator(`text="${label}" >> .. >> [role="combobox"]`);
}

/** Select an option from an open Radix Select dropdown. */
export function radixSelectOption(page: Page, optionText: string): Locator {
  return page.locator('[role="option"]').filter({ hasText: optionText });
}

// ---------------------------------------------------------------------------
// Sidebar Navigation
// ---------------------------------------------------------------------------

/** A sidebar navigation link by label text. */
export function sidebarLink(page: Page, label: string): Locator {
  return page.locator('nav a, [class*="sidebar"] a, [class*="navigation"] a')
    .filter({ hasText: label });
}
