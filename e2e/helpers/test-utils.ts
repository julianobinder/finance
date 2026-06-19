/**
 * Reusable test utilities for common E2E patterns.
 */

import { type Page, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Table loading
// ---------------------------------------------------------------------------

/**
 * Wait until loading indicators disappear and table content is visible.
 * Handles both "Loading..." text and empty-state spinners.
 */
export async function waitForTableLoaded(page: Page): Promise<void> {
  // Wait for any "Loading..." text to disappear
  await page.locator('text=/loading/i').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {
    // If no loading indicator was ever present, that is fine
  });

  // Give table rows a moment to render
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Toast assertions
// ---------------------------------------------------------------------------

/**
 * Wait for a GravityUI toast notification containing the specified text.
 * Asserts it becomes visible within the timeout.
 */
export async function waitForToast(page: Page, text: string, timeout = 5_000): Promise<void> {
  const toast = page.locator('.g-toast').filter({ hasText: text });
  await expect(toast.first()).toBeVisible({ timeout });
}

/**
 * Asynchronously accept the currently visible confirmation dialog modal.
 * Must be called AFTER the action that triggers the confirmation modal.
 */
export async function acceptConfirmDialog(page: Page): Promise<void> {
  const dialog = page.locator('.g-dialog').last();
  await expect(dialog).toBeVisible({ timeout: 5000 });
  const applyBtn = dialog.locator(
    '.g-dialog-footer .g-dialog-btn-apply button, ' +
    '.g-dialog-footer button.g-button_view_action, ' +
    '.g-dialog-footer button:has-text("Confirm"), ' +
    '.g-dialog-footer button:has-text("Delete")'
  ).first();
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();
}

/**
 * Asynchronously dismiss the currently visible confirmation dialog modal.
 * Must be called AFTER the action that triggers the confirmation modal.
 */
export async function dismissConfirmDialog(page: Page): Promise<void> {
  const dialog = page.locator('.g-dialog').last();
  await expect(dialog).toBeVisible({ timeout: 5000 });
  const cancelBtn = dialog.locator(
    '.g-dialog-footer button:has-text("Cancel")'
  ).first();
  await expect(cancelBtn).toBeVisible({ timeout: 5000 });
  await cancelBtn.click();
}

// ---------------------------------------------------------------------------
// GravityUI Dialog form helpers
// ---------------------------------------------------------------------------

/**
 * Fill a GravityUI TextInput field inside the currently open dialog.
 * Locates the field by its label text.
 */
export async function fillDialogField(page: Page, label: string, value: string): Promise<void> {
  const dialog = page.locator('.g-dialog');
  const fieldContainer = dialog.locator(`text="${label}" >> ..`);
  const input = fieldContainer.locator('.g-text-input__control');
  await input.fill(value);
}

/**
 * Fill a GravityUI TextArea field inside the currently open dialog.
 */
export async function fillDialogTextArea(page: Page, label: string, value: string): Promise<void> {
  const dialog = page.locator('.g-dialog');
  const fieldContainer = dialog.locator(`text="${label}" >> ..`);
  const textarea = fieldContainer.locator('.g-text-area__control');
  await textarea.fill(value);
}

/**
 * Toggle a GravityUI Checkbox inside the currently open dialog by label text.
 */
export async function toggleDialogCheckbox(page: Page, label: string): Promise<void> {
  const dialog = page.locator('.g-dialog');
  const checkbox = dialog.locator('.g-checkbox').filter({ hasText: label });
  await checkbox.click();
}

/**
 * Click the Apply/Submit button in a GravityUI Dialog.
 */
export async function clickDialogApply(page: Page, buttonText?: string): Promise<void> {
  const dialog = page.locator('.g-dialog');
  if (buttonText) {
    await dialog.getByRole('button', { name: buttonText }).click();
  } else {
    // Click the first action-style button in the footer
    await dialog.locator('.g-dialog-footer button').first().click();
  }
}

/**
 * Click the Cancel button in a GravityUI Dialog.
 */
export async function clickDialogCancel(page: Page): Promise<void> {
  const dialog = page.locator('.g-dialog');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
}
