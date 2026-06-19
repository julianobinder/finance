import { test, expect, type Page, type Locator } from '@playwright/test';
import { waitForTableLoaded, waitForToast, acceptConfirmDialog, dismissConfirmDialog } from '../helpers/test-utils';
import path from 'path';
import fs from 'fs';

/**
 * Regenerates the Lloyds CSV with fresh dates shifted relative to today.
 */
function regenerateCsvWithCurrentDates(sourcePath: string, destPath: string): void {
  const content = fs.readFileSync(sourcePath, 'utf8');
  const lines = content.split('\n');
  if (lines.length <= 1) return;

  const header = lines[0];
  const dataLines = lines.slice(1).filter(line => line.trim());

  // 1. First pass: Find the maximum date in the original CSV
  let maxDate = new Date(2020, 0, 1);
  const parsedRows = dataLines.map(line => {
    const parts = line.split(',');
    let dateStr = parts[0] || '';
    const hasQuotes = dateStr.startsWith('"') && dateStr.endsWith('"');
    if (hasQuotes) {
      dateStr = dateStr.slice(1, -1);
    }
    if (dateStr && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split('/').map(Number);
      const rowDate = new Date(y, m - 1, d);
      if (rowDate > maxDate) {
        maxDate = rowDate;
      }
      return { line, rowDate, parts, hasQuotes };
    }
    return { line, rowDate: null, parts, hasQuotes };
  });

  // 2. Second pass: Shift all dates relative to today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const offsetMs = today.getTime() - maxDate.getTime();

  const updatedLines = parsedRows.map(row => {
    if (row.rowDate) {
      const newDate = new Date(row.rowDate.getTime() + offsetMs);
      const dd = String(newDate.getDate()).padStart(2, '0');
      const mm = String(newDate.getMonth() + 1).padStart(2, '0');
      const yyyy = newDate.getFullYear();
      let newDateStr = `${dd}/${mm}/${yyyy}`;
      if (row.hasQuotes) {
        newDateStr = `"${newDateStr}"`;
      }
      row.parts[0] = newDateStr;
      return row.parts.join(',');
    }
    return row.line;
  });

  fs.writeFileSync(destPath, [header, ...updatedLines].join('\n'), 'utf8');
}

function createSingleTransactionCsv(destPath: string, dateStr: string): void {
  const header = `"Date","Time","Time zone","Name","Type","Status","Currency","Gross","Fee","Net","From Email Address","To Email Address","Transaction ID","Item Title","VAT","Reference Txn ID","Invoice Number","Receipt ID","Balance","Subject","Balance Impact"`;
  const row = `"${dateStr}","16:41:15","GMT","David Bowie","General Payment","Completed","GBP","-310.00","0.00","-310.00","contact@applecorps.com","ziggy@starman.org","5KB56134TT054874G","","","","","","-227.91","","Debit"`;
  fs.writeFileSync(destPath, `${header}\n${row}\n`, 'utf8');
}


/**
 * Helper: Select a value from a Radix Select dropdown.
 */
async function selectRadixOption(page: Page, modal: Locator, labelText: string, optionText: string): Promise<void> {
  const container = modal.locator(`div:has(> label:text-is("${labelText}"))  ,div:has(> label:has-text("${labelText}"))`).first();
  const trigger = container.locator('[role="combobox"]');
  await trigger.click({ force: true });
  
  if (['$', '£', '€', 'R$'].includes(optionText)) {
    const escaped = optionText.replace('$', '\\$');
    await page.locator('[role="option"]').filter({ hasText: new RegExp(`^\\s*${escaped}\\s+-`) }).click({ force: true });
  } else {
    await page.locator('[role="option"]').filter({ hasText: optionText }).click({ force: true });
  }
  await page.waitForTimeout(300);
}

/**
 * Helper: Select a value from a Radix Select dropdown by its trigger directly.
 */
async function selectRadixOptionByTrigger(page: Page, trigger: Locator, optionText: string): Promise<void> {
  await trigger.click({ force: true });
  const option = page.locator('[role="option"]').filter({ hasText: optionText }).first();
  await option.waitFor({ state: 'visible' });
  await option.click({ force: true });
  await page.waitForTimeout(300);
}

/**
 * Helper: Select a value from a GravityUI Select dropdown by its trigger.
 */
async function selectGravityOptionByTrigger(page: Page, trigger: Locator, optionText: string): Promise<void> {
  await trigger.click({ force: true });
  
  const popup = page.locator('.g-select-popup, .g-popup, [role="listbox"]').last();
  await popup.waitFor({ state: 'visible' });
  
  const option = popup.locator('.g-select-list__item, [role="option"], .g-select-popup__item').filter({ hasText: optionText }).first();
  await option.click({ force: true });
  
  await popup.waitFor({ state: 'hidden' }).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * Helper: Select a value from a GravityUI Select dropdown by its label.
 */
async function selectGravityOption(page: Page, modal: Locator, labelText: string, optionText: string): Promise<void> {
  const container = modal.locator(`div:has(> label:text-is("${labelText}")) ,div:has(> label:has-text("${labelText}"))`).first();
  const trigger = container.locator('.g-select-control');
  await selectGravityOptionByTrigger(page, trigger, optionText);
}

test.describe('Unified User Journey Flow', () => {

  test('executes all CRUD actions sequentially in a single browser session', async ({ page }) => {
    test.setTimeout(300000);
    
    // Log any API failures to the terminal for ease of debugging
    page.on('response', async (response) => {
      if (response.status() >= 400) {
        const req = response.request();
        console.log(`❌ FAILED REQUEST: ${req.method()} ${response.url()}`);
        console.log(`  Payload: ${req.postData()}`);
        try {
          console.log(`  Response: ${await response.text()}`);
        } catch (e) {}
      }
    });

    // -------------------------------------------------------------------------
    // Phase 1: Navigation & Empty Dashboard
    // -------------------------------------------------------------------------
    console.log('🏁 Step 1: Navigating to Home and verifying empty dashboard...');
    await page.goto('/');
    await expect(page.getByText('Consolidated Net Worth').first()).toBeVisible();
    await expect(page.locator('text=Finance App')).toBeVisible();

    // Verify sidebar menu items are present
    const sidebarLinks = ['Home', 'Accounts', 'Account Types', 'Account Holders', 'Currencies', 'Titulars', 'Account Groups', 'Categories', 'Payees', 'Settings'];
    for (const label of sidebarLinks) {
      await expect(page.locator('a').filter({ hasText: label }).first()).toBeVisible();
    }

    // -------------------------------------------------------------------------
    // Phase 2: Categories
    // -------------------------------------------------------------------------
    console.log('📂 Step 2: Testing Categories CRUD...');
    await page.locator('a').filter({ hasText: 'Categories' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Categories').first()).toBeVisible();

    const categoriesData = [
      { name: 'Galactic Incoming Revenues', subs: ['Stardust Royalties', 'Supernova Consulting'] },
      { name: 'Synthpop Concert Supplies', subs: ['Moog Repair Kits', 'Sequencer Modules'] },
      { name: 'Bowie Tour Wardrobe', subs: ['Glitter Capes', 'Platform Boots'] },
      { name: 'Voyager Orbit Launch', subs: ['Hydrazine Fuel', 'Telemetry Antennas'] },
      { name: 'Kraftwerk Studio Operations', subs: ['Tape Reels', 'Soldering Consoles'] }
    ];

    let dialog;
    for (const cat of categoriesData) {
      // Create parent
      await page.getByRole('button', { name: /New Category/i }).first().click();
      dialog = page.locator('.g-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('.g-text-input__control').nth(0).fill(cat.name);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await waitForToast(page, 'created successfully');
      await waitForTableLoaded(page);
      await expect(page.getByText(cat.name).first()).toBeVisible();

      // Click parent to select it
      const parentRow = page.locator('.g-table__row').filter({ hasText: cat.name }).first();
      await parentRow.click();

      // Create subcategories
      for (const sub of cat.subs) {
        await parentRow.locator('.add-sub-btn').click();
        dialog = page.locator('.g-dialog');
        await expect(dialog).toBeVisible();
        await dialog.locator('.g-text-input__control').nth(0).fill(sub);
        await dialog.getByRole('button', { name: 'Create' }).click();
        await waitForToast(page, 'created successfully');
        await waitForTableLoaded(page);
        await expect(page.getByText(sub).first()).toBeVisible();
      }
    }

    // Now test CRUD combinations: Update parent category
    const editParentRow = page.locator('.g-table__row').filter({ hasText: 'Galactic Incoming Revenues' }).first();
    await editParentRow.locator('.edit-btn').click(); // Click Edit on Parent Category
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Galactic Incoming Revenues Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Galactic Incoming Revenues Updated').first()).toBeVisible();

    // Revert it back so that downstream tests expecting "Galactic Incoming Revenues" still pass perfectly:
    const editParentRow2 = page.locator('.g-table__row').filter({ hasText: 'Galactic Incoming Revenues Updated' }).first();
    await editParentRow2.locator('.edit-btn').click(); // Click Edit on Parent Category
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Galactic Incoming Revenues');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);

    // Now test CRUD combinations: Sub-category Edit/Delete
    const selectParentRow = page.locator('.g-table__row').filter({ hasText: 'Galactic Incoming Revenues' }).first();
    await selectParentRow.click();
    await waitForTableLoaded(page);

    await selectParentRow.locator('.add-sub-btn').click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Throwaway Subcategory');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Throwaway Subcategory').first()).toBeVisible();

    const subRow = page.locator('.g-table__row').filter({ hasText: 'Throwaway Subcategory' }).first();
    await subRow.locator('.edit-btn').click(); // Click Edit
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Throwaway Subcategory Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Throwaway Subcategory Updated').first()).toBeVisible();

    const subRow2 = page.locator('.g-table__row').filter({ hasText: 'Throwaway Subcategory Updated' }).first();
    await subRow2.locator('.delete-btn').click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(subRow2).toBeHidden();

    // Create and delete a throwaway category
    await page.getByRole('button', { name: /New Category/i }).first().click();
    dialog = page.locator('.g-dialog');
    await dialog.locator('.g-text-input__control').nth(0).fill('Throwaway Parent Category');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);
    const throwawayRow = page.locator('.g-table__row').filter({ hasText: 'Throwaway Parent Category' }).first();
    await throwawayRow.locator('.delete-btn').click();
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayRow).toBeHidden();

    // Test Category Merge Flow
    console.log('🔗 Step 2b: Testing Category Merge...');
    // Ensure "Galactic Incoming Revenues" parent row is expanded
    const parentCategoryRow = page.locator('.g-table__row').filter({ hasText: 'Galactic Incoming Revenues' }).first();
    await parentCategoryRow.click();
    await waitForTableLoaded(page);

    const supernovaRow = page.locator('.g-table__row').filter({ hasText: 'Supernova Consulting' }).first();
    await expect(supernovaRow).toBeVisible();
    await supernovaRow.locator('.merge-btn').click();

    // Verify Merge Banner
    await expect(page.getByText('Merge Mode Active')).toBeVisible();

    // Click Merge Into on target subcategory "Stardust Royalties"
    const stardustRow = page.locator('.g-table__row').filter({ hasText: 'Stardust Royalties' }).first();
    await expect(stardustRow).toBeVisible();
    await stardustRow.locator('.merge-target-btn').click();

    // Accept confirmation dialog
    await acceptConfirmDialog(page);
    await waitForToast(page, 'Successfully merged');
    await waitForTableLoaded(page);

    // Verify source is deleted and merge mode closed
    await expect(supernovaRow).toBeHidden();
    await expect(page.getByText('Merge Mode Active')).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 3: Payees
    // -------------------------------------------------------------------------
    console.log('👤 Step 3: Testing Payees CRUD...');
    await page.locator('a').filter({ hasText: 'Payees' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Payees').first()).toBeVisible();

    // Create at least 10 payees
    const payeesList = [
      'Kraftwerk Synthesizers',
      'Led Zeppelin Studio',
      'Pink Floyd Laser Show',
      'Bowie Glam Costumes',
      'Voyager Mission Control',
      'Viking Mars Lander Team',
      'Apollo Soyuz Docking Service',
      'Skylab Hardware Supplies',
      'Sagan Cosmos Broadcasting',
      'Hawking Physics Journals'
    ];

    for (const payeeName of payeesList) {
      await page.getByRole('button', { name: /Add Payee/i }).click();
      dialog = page.locator('.g-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('.g-text-input__control').first().fill(payeeName);
      await dialog.locator('.g-text-area__control').first().fill('Seeded comment for ' + payeeName);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await waitForToast(page, 'created successfully');
      await waitForTableLoaded(page);
      await expect(page.getByText(payeeName).first()).toBeVisible();
    }

    // Edit payee
    const payeeRow = page.locator('tbody .g-table__row').filter({ hasText: 'Kraftwerk Synthesizers' }).first();
    await payeeRow.locator('button').first().click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Kraftwerk Synthesizers Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Kraftwerk Synthesizers Updated').first()).toBeVisible();

    // Revert the payee name
    const payeeRow2 = page.locator('tbody .g-table__row').filter({ hasText: 'Kraftwerk Synthesizers Updated' }).first();
    await payeeRow2.locator('button').first().click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Kraftwerk Synthesizers');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);

    // Now test CRUD combinations: Create throwaway payee and delete it
    await page.getByRole('button', { name: /Add Payee/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Throwaway Payee');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    const throwawayPayeeRow = page.locator('tbody .g-table__row').filter({ hasText: 'Throwaway Payee' }).first();
    await throwawayPayeeRow.locator('button').nth(1).click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayPayeeRow).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 4: Currencies
    // -------------------------------------------------------------------------
    console.log('💱 Step 4: Testing Currencies CRUD...');
    await page.locator('a').filter({ hasText: 'Currencies' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Currencies').first()).toBeVisible();

    // Create 4 main currencies
    const currenciesData = [
      { name: 'US Dollar', isocode: 'USD', symbol: '$', order: '1' },
      { name: 'British Pound', isocode: 'GBP', symbol: '£', order: '2' },
      { name: 'Euro', isocode: 'EUR', symbol: '€', order: '3' },
      { name: 'Brazilian Real', isocode: 'BRL', symbol: 'R$', order: '4' }
    ];

    for (const curr of currenciesData) {
      await page.getByRole('button', { name: /Add Currency/i }).click();
      dialog = page.locator('.g-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('.g-text-input__control').nth(0).fill(curr.name);
      await dialog.locator('.g-text-input__control').nth(1).fill(curr.isocode);
      await dialog.locator('.g-text-input__control').nth(2).fill(curr.symbol);
      await dialog.locator('.g-text-input__control').nth(3).fill(curr.order);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await waitForToast(page, 'created successfully');
      await waitForTableLoaded(page);
      await expect(page.getByText(curr.name).first()).toBeVisible();
    }

    // Now test CRUD combinations: Update BRL to BRL Updated
    const brlRow = page.locator('tbody .g-table__row').filter({ hasText: 'Brazilian Real' }).first();
    await brlRow.locator('button').first().click(); // click Edit
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Brazilian Real Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Brazilian Real Updated').first()).toBeVisible();

    // Now test CRUD combinations: Create a throwaway currency and delete it
    await page.getByRole('button', { name: /Add Currency/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Throwaway Currency');
    await dialog.locator('.g-text-input__control').nth(1).fill('THW');
    await dialog.locator('.g-text-input__control').nth(2).fill('T');
    await dialog.locator('.g-text-input__control').nth(3).fill('99');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    const throwawayCurrRow = page.locator('tbody .g-table__row').filter({ hasText: 'Throwaway Currency' }).first();
    await throwawayCurrRow.locator('button').nth(1).click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayCurrRow).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 5: Titulars
    // -------------------------------------------------------------------------
    console.log('👔 Step 5: Testing Titulars CRUD...');
    await page.locator('a').filter({ hasText: 'Titulars' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Titulars').first()).toBeVisible();

    // Create 3 titulars
    const titulars = ['Primary Titular', 'Secondary Titular', 'Business Titular'];
    for (const name of titulars) {
      await page.getByRole('button', { name: /Add Titular/i }).click();
      dialog = page.locator('.g-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('.g-text-input__control').first().fill(name);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await waitForToast(page, 'created successfully');
      await waitForTableLoaded(page);
      await expect(page.getByText(name).first()).toBeVisible();
    }

    // Now test CRUD combinations: Edit Titular
    const titularRow = page.locator('tbody .g-table__row').filter({ hasText: 'Primary Titular' }).first();
    await titularRow.locator('button').first().click(); // Click Edit
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Primary Titular Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Primary Titular Updated').first()).toBeVisible();

    // Revert name back to Primary Titular
    const titularRow2 = page.locator('tbody .g-table__row').filter({ hasText: 'Primary Titular Updated' }).first();
    await titularRow2.locator('button').first().click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Primary Titular');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);

    // Create and Delete throwaway titular
    await page.getByRole('button', { name: /Add Titular/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Throwaway Titular');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    const throwawayTitularRow = page.locator('tbody .g-table__row').filter({ hasText: 'Throwaway Titular' }).first();
    await throwawayTitularRow.locator('button').nth(1).click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayTitularRow).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 6: Account Holders
    // -------------------------------------------------------------------------
    console.log('🏢 Step 6: Testing Account Holders CRUD...');
    await page.locator('a').filter({ hasText: 'Account Holders' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Account Holders').first()).toBeVisible();

    // Create 3 holders
    const holders = ['Apollo Space Credit Union', 'Skylab Trust', 'Pioneer Federal'];
    for (const name of holders) {
      await page.getByRole('button', { name: /Add Account Holder/i }).click();
      dialog = page.locator('.g-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('.g-text-input__control').first().fill(name);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await waitForToast(page, 'created successfully');
      await waitForTableLoaded(page);
      await expect(page.getByText(name).first()).toBeVisible();
    }

    // Now test CRUD combinations: Edit Account Holder
    const holderRow = page.locator('tbody .g-table__row').filter({ hasText: 'Apollo Space Credit Union' }).first();
    await holderRow.locator('button').first().click(); // Click Edit
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Apollo Space Credit Union Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Apollo Space Credit Union Updated').first()).toBeVisible();

    // Revert name back to Apollo Space Credit Union
    const holderRow2 = page.locator('tbody .g-table__row').filter({ hasText: 'Apollo Space Credit Union Updated' }).first();
    await holderRow2.locator('button').first().click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Apollo Space Credit Union');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);

    // Create and Delete throwaway holder
    await page.getByRole('button', { name: /Add Account Holder/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Throwaway Holder');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    const throwawayHolderRow = page.locator('tbody .g-table__row').filter({ hasText: 'Throwaway Holder' }).first();
    await throwawayHolderRow.locator('button').nth(1).click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayHolderRow).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 7: Account Types
    // -------------------------------------------------------------------------
    console.log('💳 Step 7: Testing Account Types CRUD...');
    await page.locator('a').filter({ hasText: 'Account Types' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Account Types').first()).toBeVisible();

    // Create 4 account types
    const typesData = [
      { name: 'Current Account', code: '100' },
      { name: 'Credit Card', code: '200' },
      { name: 'Cash', code: '300' },
      { name: 'Assets', code: '400' }
    ];

    for (const item of typesData) {
      await page.getByRole('button', { name: /Add Account Type/i }).click();
      dialog = page.locator('.g-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('.g-text-input__control').nth(0).fill(item.name);
      await dialog.locator('.g-text-input__control').nth(1).fill(item.code);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await waitForToast(page, 'created successfully');
      await waitForTableLoaded(page);
      await expect(page.getByText(item.name).first()).toBeVisible();
    }

    // Now test CRUD combinations: Edit Account Type
    const typeRow = page.locator('tbody .g-table__row').filter({ hasText: 'Current Account' }).first();
    await typeRow.locator('button').first().click(); // Click Edit
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Current Account Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Current Account Updated').first()).toBeVisible();

    // Revert name back to Current Account
    const typeRow2 = page.locator('tbody .g-table__row').filter({ hasText: 'Current Account Updated' }).first();
    await typeRow2.locator('button').first().click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Current Account');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);

    // Create and Delete throwaway type
    await page.getByRole('button', { name: /Add Account Type/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').nth(0).fill('Throwaway Type');
    await dialog.locator('.g-text-input__control').nth(1).fill('999');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    const throwawayTypeRow = page.locator('tbody .g-table__row').filter({ hasText: 'Throwaway Type' }).first();
    await throwawayTypeRow.locator('button').nth(1).click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayTypeRow).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 8: Account Groups
    // -------------------------------------------------------------------------
    console.log('👥 Step 8: Testing Account Groups CRUD...');
    await page.locator('a').filter({ hasText: 'Account Groups' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Account Groups').first()).toBeVisible();

    // Create 3 groups
    const groups = ['Kraftwerk Music Group', 'Led Zeppelin Holdings', 'Pink Floyd Records'];
    for (const name of groups) {
      await page.getByRole('button', { name: /Add Account Group/i }).click();
      dialog = page.locator('.g-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('.g-text-input__control').first().fill(name);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await waitForToast(page, 'created successfully');
      await waitForTableLoaded(page);
      await expect(page.getByText(name).first()).toBeVisible();
    }

    // Now test CRUD combinations: Edit Account Group
    const groupRow = page.locator('tbody .g-table__row').filter({ hasText: 'Kraftwerk Music Group' }).first();
    await groupRow.locator('button').first().click(); // Click Edit
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Kraftwerk Music Group Updated');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);
    await expect(page.getByText('Kraftwerk Music Group Updated').first()).toBeVisible();

    // Revert name back to Kraftwerk Music Group
    const groupRow2 = page.locator('tbody .g-table__row').filter({ hasText: 'Kraftwerk Music Group Updated' }).first();
    await groupRow2.locator('button').first().click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Kraftwerk Music Group');
    await dialog.getByRole('button', { name: 'Update' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);

    // Create and Delete throwaway group
    await page.getByRole('button', { name: /Add Account Group/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.g-text-input__control').first().fill('Throwaway Group');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    const throwawayGroupRow = page.locator('tbody .g-table__row').filter({ hasText: 'Throwaway Group' }).first();
    await throwawayGroupRow.locator('button').nth(1).click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayGroupRow).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 9: Accounts (Linking references)
    // -------------------------------------------------------------------------
    console.log('🏦 Step 9: Creating Accounts combinations...');
    await page.locator('a').filter({ hasText: 'Accounts' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Accounts').first()).toBeVisible();

    const accountsData = [
      { 
        name: 'Main Checking', 
        type: 'Current Account', 
        titular: 'Primary Titular', 
        currency: '$', 
        holder: 'Apollo Space Credit Union', 
        group: 'Kraftwerk Music Group',
        initialBalance: '1000.00'
      },
      { 
        name: 'Visa Platinum', 
        type: 'Credit Card', 
        titular: 'Secondary Titular', 
        currency: '€', 
        holder: 'Skylab Trust', 
        group: 'Led Zeppelin Holdings' 
      },
      { 
        name: 'Petty Cash', 
        type: 'Cash', 
        titular: 'Primary Titular', 
        currency: 'R$', 
        holder: 'Apollo Space Credit Union', 
        group: 'Pink Floyd Records',
        initialBalance: '250.00'
      },
      { 
        name: 'Real Estate Asset', 
        type: 'Assets', 
        titular: 'Business Titular', 
        currency: '£', 
        holder: 'Pioneer Federal', 
        group: 'Pink Floyd Records' 
      }
    ];

    for (const acc of accountsData) {
      await page.getByRole('button', { name: /New Account/i }).click();
      let modal = page.locator('.fixed.inset-0').first();
      await expect(modal).toBeVisible();

      await modal.locator('#name').fill(acc.name);
      await selectRadixOption(page, modal, 'Account Type *', acc.type);
      await modal.locator('#entry').fill('2026-05-17');
      await selectRadixOption(page, modal, 'Titular *', acc.titular);
      await selectRadixOption(page, modal, 'Currency *', acc.currency);
      await selectRadixOption(page, modal, 'Account Holder', acc.holder);
      await modal.locator('label').filter({ hasText: acc.group }).click();

      if (acc.initialBalance) {
        await modal.locator('#initial_balance').fill(acc.initialBalance);
      }

      await modal.getByRole('button', { name: /Save/i }).click();
      await waitForTableLoaded(page);
      await expect(page.getByText(acc.name).first()).toBeVisible();
    }

    // Now test CRUD combinations: Edit Account (Update)
    const accRow = page.locator('.g-table__row').filter({ hasText: 'Main Checking' }).first();
    await accRow.locator('button').first().click(); // Click Edit
    let editModal = page.locator('.fixed.inset-0').first();
    await expect(editModal).toBeVisible();
    await editModal.locator('#name').fill('Main Checking Updated');
    await editModal.getByRole('button', { name: /Save/i }).click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Main Checking Updated').first()).toBeVisible();

    // Revert name back to Main Checking
    const accRow2 = page.locator('.g-table__row').filter({ hasText: 'Main Checking Updated' }).first();
    await accRow2.locator('button').first().click(); // Click Edit
    editModal = page.locator('.fixed.inset-0').first();
    await expect(editModal).toBeVisible();
    await editModal.locator('#name').fill('Main Checking');
    await editModal.getByRole('button', { name: /Save/i }).click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Main Checking').first()).toBeVisible();

    // Create and Delete throwaway account
    await page.getByRole('button', { name: /New Account/i }).click();
    const throwawayModal = page.locator('.fixed.inset-0').first();
    await expect(throwawayModal).toBeVisible();
    await throwawayModal.locator('#name').fill('Throwaway Account');
    await selectRadixOption(page, throwawayModal, 'Account Type *', 'Current Account');
    await throwawayModal.locator('#entry').fill('2026-06-01');
    await selectRadixOption(page, throwawayModal, 'Titular *', 'Primary Titular');
    await selectRadixOption(page, throwawayModal, 'Currency *', '$');
    await selectRadixOption(page, throwawayModal, 'Account Holder', 'Apollo Space Credit Union');
    await throwawayModal.getByRole('button', { name: /Save/i }).click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Throwaway Account').first()).toBeVisible();

    const throwawayAccRow = page.locator('.g-table__row').filter({ hasText: 'Throwaway Account' }).first();
    await throwawayAccRow.locator('button').nth(1).click(); // Click Delete
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await expect(throwawayAccRow).toBeHidden();

    // -------------------------------------------------------------------------
    // Phase 10: Dashboard Verification
    // -------------------------------------------------------------------------
    console.log('📊 Step 10: Verifying updated dashboard...');
    await page.locator('a').filter({ hasText: 'Home' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('Consolidated Net Worth').first()).toBeVisible();

    // Groups and Accounts should render in the dashboard tables
    await expect(page.getByText('Kraftwerk Music Group').first()).toBeVisible();
    await expect(page.getByText('Led Zeppelin Holdings').first()).toBeVisible();
    await expect(page.getByText('Pink Floyd Records').first()).toBeVisible();
    await expect(page.getByText('Main Checking').first()).toBeVisible();
    await expect(page.getByText('Visa Platinum').first()).toBeVisible();
    await expect(page.getByText('Petty Cash').first()).toBeVisible();
    await expect(page.getByText('Real Estate Asset').first()).toBeVisible();

    // Assert that the initial balances are displayed on the dashboard for seeded accounts
    console.log('  Asserting dashboard balance cells for seeded initial balances...');
    const checkingRow = page.locator('.g-table__row').filter({ hasText: 'Main Checking' }).first();
    await expect(checkingRow.getByText('1,000.00')).toBeVisible();

    const pettyRow = page.locator('.g-table__row').filter({ hasText: 'Petty Cash' }).first();
    await expect(pettyRow.getByText('250.00')).toBeVisible();

    // Click account row to verify transaction routing
    const accountRow = page.locator('.g-table__row').filter({ hasText: 'Main Checking' }).first();
    await accountRow.click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/accounts\/\d+\/transactions/);

    // -------------------------------------------------------------------------
    // Phase 11: Transactions E2E Verification
    // -------------------------------------------------------------------------
    console.log('💸 Step 11: Testing Transactions and Modal Form...');
    
    // We are on the Transactions page of 'Main Checking' account (USD)
    await expect(page.getByText('Main Checking').first()).toBeVisible();

    // Verify initial balance displays in the transaction page header
    const initialBalanceHeader = page.locator('span.text-3xl.font-bold');
    await expect(initialBalanceHeader).toHaveText(/.*1,000\.00/);

    // Verify that clicking the Initial Balance transaction row triggers the warning dialog
    console.log('  11.0: Verifying Initial Balance transaction protection...');
    const initialBalanceRow = page.locator('.g-table__row').filter({ hasText: 'Initial Balance' }).first();
    await expect(initialBalanceRow).toBeVisible();
    await initialBalanceRow.click();
    
    // Check that the warning Dialog pops up
    const warningDialog = page.locator('.g-dialog').filter({ hasText: 'Alert' });
    await expect(warningDialog).toBeVisible();
    await expect(warningDialog.getByText('Initial balance transactions can only be edited in the account form.')).toBeVisible();
    
    // Close the warning Dialog by clicking OK
    await warningDialog.getByRole('button', { name: 'OK' }).click();
    await expect(warningDialog).toBeHidden();

    // --- 11.1 Withdrawal CRUD ---
    console.log('  11.1: Testing Withdrawal CRUD...');
    await page.getByRole('button', { name: /Add Transaction/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();

    // Verify Withdrawal is selected by default
    await expect(dialog.locator('input[value="withdrawal"]')).toBeChecked();

    // Select Payee, Category, Sub-Category
    await selectGravityOption(page, dialog, 'Payee', 'Kraftwerk Synthesizers');
    await selectGravityOption(page, dialog, 'Category', 'Synthpop Concert Supplies');
    await selectGravityOption(page, dialog, 'Sub-Category', 'Moog Repair Kits');

    // Fill Comments, Reference, Amount
    await dialog.locator('div:has(> label:has-text("Comments")) .g-text-area__control').fill('Withdrawal CRUD test comments');
    await dialog.locator('div:has(> label:has-text("Reference")) .g-text-input__control').fill('REF-CRUD-001');
    await dialog.locator('div:has(> label:text-is("Amount")) .g-text-input__control').fill('150.00');

    // Select Cash at date (ensure it's 2026-05-18)
    await dialog.locator('div:has(> label:text-is("Cash at")) input[type="date"]').nth(0).fill('2026-05-18');

    // Save and wait for toast
    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Save' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    // Verify row rendered in table
    let transactionRow = page.locator('.g-table__row').filter({ hasText: 'Kraftwerk Synthesizers' }).first();
    await expect(transactionRow).toBeVisible();
    await expect(transactionRow.getByText('150.00', { exact: true }).first()).toBeVisible();

    // Open transaction to edit (click row)
    await transactionRow.click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();

    // Modify Status to Reconciled
    await dialog.locator('input[value="reconciled"]').click({ force: true });

    // Save and wait for toast
    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Save' }).click();
    await waitForToast(page, 'updated successfully');
    await waitForTableLoaded(page);

    // Open transaction again to delete
    transactionRow = page.locator('.g-table__row').filter({ hasText: 'Kraftwerk Synthesizers' }).first();
    await transactionRow.click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();

    // Delete transaction
    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Delete' }).click();
    await acceptConfirmDialog(page);
    await waitForToast(page, 'deleted successfully');
    await waitForTableLoaded(page);
    await expect(transactionRow).toBeHidden();


    // --- 11.2 All Dates Withdrawal ---
    console.log('  11.2: Testing All Dates Withdrawal...');
    await page.getByRole('button', { name: /Add Transaction/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();

    await selectGravityOption(page, dialog, 'Payee', 'Led Zeppelin Studio');
    await selectGravityOption(page, dialog, 'Category', 'Synthpop Concert Supplies');
    await selectGravityOption(page, dialog, 'Sub-Category', 'Moog Repair Kits');
    await dialog.locator('div:has(> label:text-is("Amount")) .g-text-input__control').fill('45.00');

    // Toggle additional dates via calendar icon
    await dialog.locator('button:has(.lucide-calendar)').click();

    // Fill all dates
    await dialog.locator('div:has(> label:text-is("Cash at")) input[type="date"]').nth(0).fill('2026-05-19');
    await dialog.locator('div:has(> label:text-is("Paid at")) input[type="date"]').nth(0).fill('2026-05-20');
    await dialog.locator('div:has(> label:text-is("Received at")) input[type="date"]').nth(0).fill('2026-05-21');
    await dialog.locator('div:has(> label:text-is("Issued at")) input[type="date"]').nth(0).fill('2026-05-18');
    await dialog.locator('div:has(> label:text-is("Due at")) input[type="date"]').nth(0).fill('2026-06-15');
    await dialog.locator('div:has(> label:text-is("Refer to")) input[type="date"]').nth(0).fill('2026-05-25');

    // Save and wait
    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Save' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);
    await expect(page.locator('.g-table__row').filter({ hasText: 'Led Zeppelin Studio' }).first()).toBeVisible();


    // --- 11.3 Category Split Withdrawal ---
    console.log('  11.3: Testing Split Transaction...');
    await page.getByRole('button', { name: /Add Transaction/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();

    await selectGravityOption(page, dialog, 'Payee', 'Pink Floyd Laser Show');
    await dialog.locator('div:has(> label:text-is("Amount")) .g-text-input__control').fill('200.00');

    // Explicitly set date ahead of initial balance (ensure it's 2026-05-20)
    await dialog.locator('div:has(> label:text-is("Cash at")) input[type="date"]').nth(0).fill('2026-05-20');

    // Click Split button to open splits view
    await dialog.getByRole('button', { name: /Split/i }).click();

    // Add Split twice to create two split rows
    await dialog.getByRole('button', { name: /Add Split/i }).click();
    await dialog.getByRole('button', { name: /Add Split/i }).click();

    // Split Row 1
    const splitSelect0 = dialog.locator('.bg-gray-50 .g-select-control').nth(0);
    await selectGravityOptionByTrigger(page, splitSelect0, 'Synthpop Concert Supplies: Moog Repair Kits');
    const splitAmt0 = dialog.locator('.bg-gray-50 .g-text-input__control').nth(0);
    await splitAmt0.fill('100.00');

    // Split Row 2 - First enter an unbalanced amount (50.00)
    const splitSelect1 = dialog.locator('.bg-gray-50 .g-select-control').nth(1);
    await selectGravityOptionByTrigger(page, splitSelect1, 'Synthpop Concert Supplies: Sequencer Modules');
    const splitAmt1 = dialog.locator('.bg-gray-50 .g-text-input__control').nth(1);
    await splitAmt1.fill('50.00');

    // Try to save and verify it is prevented with the error toast
    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Save' }).click();
    await waitForToast(page, "The sum of split amounts must equal the transaction's total amount.");

    // Correct the second split amount to 100.00 to balance the splits (100.00 + 100.00 = 200.00)
    await splitAmt1.fill('100.00');

    // Save and wait
    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Save' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);
    await expect(page.locator('.g-table__row').filter({ hasText: 'Pink Floyd Laser Show' }).first()).toBeVisible();


    // --- 11.4 Simple Deposit ---
    console.log('  11.4: Testing Simple Deposit...');
    await page.getByRole('button', { name: /Add Transaction/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();

    // Choose Deposit
    await dialog.locator('input[value="deposit"]').click({ force: true });

    await selectGravityOption(page, dialog, 'Payee', 'Sagan Cosmos Broadcasting');
    await selectGravityOption(page, dialog, 'Category', 'Galactic Incoming Revenues');
    await selectGravityOption(page, dialog, 'Sub-Category', 'Stardust Royalties');
    await dialog.locator('div:has(> label:text-is("Amount")) .g-text-input__control').fill('500.00');
    await dialog.locator('div:has(> label:text-is("Cash at")) input[type="date"]').nth(0).fill('2026-05-21');

    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Save' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);
    await expect(page.locator('.g-table__row').filter({ hasText: 'Sagan Cosmos Broadcasting' }).first()).toBeVisible();


    // --- 11.5 Cross-Currency Transfer ---
    console.log('  11.5: Testing Cross-Currency Transfer Calculation and Save...');
    await page.getByRole('button', { name: /Add Transaction/i }).click();
    dialog = page.locator('.g-dialog');
    await expect(dialog).toBeVisible();

    // Select Transfer
    await dialog.locator('input[value="transfer"]').click({ force: true });

    // Select Destination Account: Visa Platinum (which is EUR)
    await selectGravityOption(page, dialog, 'Destination Account', 'Visa Platinum');

    // Fill amount (Source Amount)
    const srcAmtInput = dialog.locator('div:has(> label:has-text("Amount")) .g-text-input__control').first();
    await srcAmtInput.fill('100.00');

    // Test automatic exchange rate blur calculation: Rate = 0.85 should set Dest Amount = 85.00
    const rateInput = dialog.locator('div:has(> label:has-text("Exchange Rate")) .g-text-input__control');
    await rateInput.fill('0.85');
    await rateInput.blur();
    const destAmtInput = dialog.locator('div:has(> label:text-is("Destination Amount")) .g-text-input__control');
    await expect(destAmtInput).toHaveValue('85.00');

    // Test reverse calculation: Dest Amount = 90.00 should set Rate = 0.900000
    await destAmtInput.fill('90.00');
    await destAmtInput.blur();
    await expect(rateInput).toHaveValue('0.900000');

    // Set rate back to 0.85 and compute
    await rateInput.fill('0.85');
    await rateInput.blur();
    await expect(destAmtInput).toHaveValue('85.00');

    // Fill Original Currency (GBP) and Original Amount (70.00)
    await selectGravityOption(page, dialog, 'Original Currency', 'GBP');
    await dialog.locator('div:has(> label:has-text("Original Amount")) .g-text-input__control').fill('70.00');

    // Toggle dates column and set all date fields for both columns
    await dialog.locator('button:has(.lucide-calendar)').click();
    
    // Left Column (Source Account) Dates
    await dialog.locator('div:has(> label:text-is("Cash at")) input[type="date"]').nth(0).fill('2026-05-22');
    await dialog.locator('div:has(> label:text-is("Paid at")) input[type="date"]').nth(0).fill('2026-05-23');
    await dialog.locator('div:has(> label:text-is("Received at")) input[type="date"]').nth(0).fill('2026-05-24');
    await dialog.locator('div:has(> label:text-is("Issued at")) input[type="date"]').nth(0).fill('2026-05-20');
    await dialog.locator('div:has(> label:text-is("Due at")) input[type="date"]').nth(0).fill('2026-06-15');
    await dialog.locator('div:has(> label:text-is("Refer to")) input[type="date"]').nth(0).fill('2026-05-25');

    // Right Column (Destination Account) Dates
    await dialog.locator('div:has(> label:text-is("Cash at")) input[type="date"]').nth(1).fill('2026-05-23');
    await dialog.locator('div:has(> label:text-is("Paid at")) input[type="date"]').nth(1).fill('2026-05-24');
    await dialog.locator('div:has(> label:text-is("Received at")) input[type="date"]').nth(1).fill('2026-05-25');
    await dialog.locator('div:has(> label:text-is("Issued at")) input[type="date"]').nth(1).fill('2026-05-21');
    await dialog.locator('div:has(> label:text-is("Due at")) input[type="date"]').nth(1).fill('2026-06-15');
    await dialog.locator('div:has(> label:text-is("Refer to")) input[type="date"]').nth(1).fill('2026-05-26');

    // Save and wait
    await dialog.locator('.g-dialog-footer button').filter({ hasText: 'Save' }).click();
    await waitForToast(page, 'created successfully');
    await waitForTableLoaded(page);

    // Verify Transfer row is visible in main checking transactions list
    await expect(page.locator('.g-table__row').filter({ hasText: 'Transfer' }).first()).toBeVisible();

    // Verify the final calculated running balance is correct ($1,155.00)
    console.log('  Verifying final running balance of Main Checking account...');
    const finalBalanceHeader = page.locator('span.text-3xl.font-bold');
    await expect(finalBalanceHeader).toHaveText(/.*1,155\.00/);

    // -------------------------------------------------------------------------
    // Phase 12: CSV Templates & Import Plans Flow
    // -------------------------------------------------------------------------
    console.log('🛠  Phase 12: CSV Templates & Import Plans Flow...');
    
    // Navigate to CSV Templates
    await page.locator('a').filter({ hasText: 'CSV Templates' }).first().click();
    await waitForTableLoaded(page);
    await expect(page.getByText('CSV Templates').first()).toBeVisible();

    // Dynamically regenerate all 4 CSV files
    const abbeyRoadOriginal = path.resolve(__dirname, '../csv/abbey_road_trust_statement.csv');
    const abbeyRoadDynamic = path.resolve(__dirname, '../csv/abbey_road_current.csv');
    regenerateCsvWithCurrentDates(abbeyRoadOriginal, abbeyRoadDynamic);

    const carnabyStreetOriginal = path.resolve(__dirname, '../csv/carnaby_street_card_statement.csv');
    const carnabyStreetDynamic = path.resolve(__dirname, '../csv/carnaby_street_current.csv');
    regenerateCsvWithCurrentDates(carnabyStreetOriginal, carnabyStreetDynamic);

    const electricLadylandOriginal = path.resolve(__dirname, '../csv/electric_ladyland_trust_statement.csv');
    const electricLadylandDynamic = path.resolve(__dirname, '../csv/electric_ladyland_current.csv');
    regenerateCsvWithCurrentDates(electricLadylandOriginal, electricLadylandDynamic);

    const sgtPepperOriginal = path.resolve(__dirname, '../csv/sgt_pepper_paypal_statement.csv');
    const sgtPepperDynamic = path.resolve(__dirname, '../csv/sgt_pepper_current.csv');
    regenerateCsvWithCurrentDates(sgtPepperOriginal, sgtPepperDynamic);

    // --- 12.1: CREATE 4 CSV TEMPLATES ---
    console.log('  12.1: Creating 4 CSV Templates...');

    // Template 1: Abbey Road Trust Template
    await page.getByRole('button', { name: /New Template/i }).click();
    let templateDialog = page.locator('[role="dialog"]').first();
    await expect(templateDialog).toBeVisible();
    await templateDialog.locator('#templateName').fill('Abbey Road Trust Template');
    await templateDialog.locator('input[type="file"]').setInputFiles(abbeyRoadDynamic);
    await page.waitForTimeout(500);
    // Map Fields
    await templateDialog.locator('tr:has-text("Transaction Date")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^CASH_DATE$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Transaction Description")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^PAYEE_DESC$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Debit Amount")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^-AMOUNT/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Credit Amount")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^AMOUNT$/ }).first().click({ force: true });
    await templateDialog.getByRole('button', { name: 'Create Template' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Abbey Road Trust Template').first()).toBeVisible();

    // Template 2: Carnaby Street Card Template
    await page.getByRole('button', { name: /New Template/i }).click();
    templateDialog = page.locator('[role="dialog"]').first();
    await expect(templateDialog).toBeVisible();
    await templateDialog.locator('#templateName').fill('Carnaby Street Card Template');
    await templateDialog.locator('input[type="file"]').setInputFiles(carnabyStreetDynamic);
    await page.waitForTimeout(500);
    // Map Fields
    await templateDialog.locator('tr:has-text("Clearance Date")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^CASH_DATE$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Description")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^PAYEE_DESC$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Amount")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^AMOUNT$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Original Amount")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^COMMENTS$/ }).first().click({ force: true });
    await templateDialog.getByRole('button', { name: 'Create Template' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Carnaby Street Card Template').first()).toBeVisible();

    // Template 3: Electric Ladyland Trust Template
    await page.getByRole('button', { name: /New Template/i }).click();
    templateDialog = page.locator('[role="dialog"]').first();
    await expect(templateDialog).toBeVisible();
    await templateDialog.locator('#templateName').fill('Electric Ladyland Trust Template');
    await templateDialog.locator('input[type="file"]').setInputFiles(electricLadylandDynamic);
    await page.waitForTimeout(500);
    // Map Fields
    await templateDialog.locator('tr:has-text("Transaction Date")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^CASH_DATE$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Transaction Description")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^PAYEE_DESC$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Debit Amount")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^-AMOUNT/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Credit Amount")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^AMOUNT$/ }).first().click({ force: true });
    await templateDialog.getByRole('button', { name: 'Create Template' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Electric Ladyland Trust Template').first()).toBeVisible();

    // Template 4: Sgt Pepper Paypal Template
    await page.getByRole('button', { name: /New Template/i }).click();
    templateDialog = page.locator('[role="dialog"]').first();
    await expect(templateDialog).toBeVisible();
    await templateDialog.locator('#templateName').fill('Sgt Pepper Paypal Template');
    await templateDialog.locator('input[type="file"]').setInputFiles(sgtPepperDynamic);
    await page.waitForTimeout(500);
    // Map Fields
    await templateDialog.locator('tr:has-text("Date")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^CASH_DATE$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Name")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^PAYEE_DESC$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Gross")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^AMOUNT$/ }).first().click({ force: true });
    await templateDialog.locator('tr:has-text("Fee")').locator('button').first().click();
    await page.locator('[role="option"]').filter({ hasText: /^FEE$/ }).first().click({ force: true });
    await templateDialog.getByRole('button', { name: 'Create Template' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('Sgt Pepper Paypal Template').first()).toBeVisible();


    // --- 12.2: CREATE 4 IMPORT PLANS & 20 MATCHING RULES ---
    console.log('  12.2: Configuring 4 Import Plans with 5 rules each...');
    await page.locator('a').filter({ hasText: 'CSV Import Plan' }).first().click();
    await waitForTableLoaded(page);

    const plansConfig = [
      {
        name: 'Abbey Road E2E Import Plan',
        account: 'Real Estate Asset',
        template: 'Abbey Road Trust Template',
        rules: [
          { field: 'Transaction Description', pattern: 'CAPITAL ON TAP', usePayee: 'Pink Floyd Laser Show', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' },
          { field: 'Transaction Description', pattern: 'EE LIMITED', ignore: true },
          { field: 'Transaction Description', pattern: 'TRIDENT STUDIOS', usePayee: 'Led Zeppelin Studio', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Sequencer Modules' },
          { field: 'Transaction Description', pattern: 'ZIGGY STARDUST', usePayee: 'Sagan Cosmos Broadcasting', useCategory: true, category: 'Galactic Incoming Revenues', subcategory: 'Stardust Royalties' },
          { field: 'Transaction Description', pattern: 'MARQUEE CLUB', usePayee: 'Kraftwerk Synthesizers', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' }
        ]
      },
      {
        name: 'Carnaby Street E2E Import Plan',
        account: 'Visa Platinum',
        template: 'Carnaby Street Card Template',
        rules: [
          { field: 'Description', pattern: 'ORANGE AMPLIFIERS', usePayee: 'Led Zeppelin Studio', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Sequencer Modules' },
          { field: 'Description', pattern: 'BIBA BOUTIQUE', usePayee: 'Pink Floyd Laser Show', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' },
          { field: 'Description', pattern: 'MARQUEE CLUB', usePayee: 'Kraftwerk Synthesizers', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' },
          { field: 'Description', pattern: 'ABBEY ROAD STUDIOS', usePayee: 'Led Zeppelin Studio', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Sequencer Modules' },
          { field: 'Description', pattern: 'SHEPPERTON REHEARSALS', usePayee: 'Sagan Cosmos Broadcasting', useCategory: true, category: 'Galactic Incoming Revenues', subcategory: 'Stardust Royalties' }
        ]
      },
      {
        name: 'Electric Ladyland E2E Import Plan',
        account: 'Petty Cash',
        template: 'Electric Ladyland Trust Template',
        rules: [
          { field: 'Transaction Description', pattern: 'JIMI HENDRIX', usePayee: 'Led Zeppelin Studio', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Sequencer Modules' },
          { field: 'Transaction Description', pattern: 'OLYMPIC STUDIOS', usePayee: 'Pink Floyd Laser Show', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' },
          { field: 'Transaction Description', pattern: 'LED ZEPPELIN', usePayee: 'Kraftwerk Synthesizers', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' },
          { field: 'Transaction Description', pattern: 'CAPITAL ON TAP', usePayee: 'Sagan Cosmos Broadcasting', useCategory: true, category: 'Galactic Incoming Revenues', subcategory: 'Stardust Royalties' },
          { field: 'Transaction Description', pattern: 'KERRISON DRUMS', usePayee: 'Kraftwerk Synthesizers', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' }
        ]
      },
      {
        name: 'Sgt Pepper E2E Import Plan',
        account: 'Main Checking',
        template: 'Sgt Pepper Paypal Template',
        rules: [
          { field: 'Name', pattern: 'David Bowie', usePayee: 'Pink Floyd Laser Show', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' },
          { field: 'Name', pattern: 'Syd Barrett', usePayee: 'Kraftwerk Synthesizers', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' },
          { field: 'Name', pattern: 'Roxy Music', usePayee: 'Led Zeppelin Studio', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Sequencer Modules' },
          { field: 'Name', pattern: 'Brian Epstein', usePayee: 'Sagan Cosmos Broadcasting', useCategory: true, category: 'Galactic Incoming Revenues', subcategory: 'Stardust Royalties' },
          { field: 'Name', pattern: 'Paul McCartney', usePayee: 'Kraftwerk Synthesizers', useCategory: true, category: 'Synthpop Concert Supplies', subcategory: 'Moog Repair Kits' }
        ]
      }
    ];

    for (const plan of plansConfig) {
      await page.getByTestId('new-plan-button').click();
      let planDialog = page.locator('[role="dialog"]').first();
      await expect(planDialog).toBeVisible();

      await planDialog.getByTestId('plan-name-input').fill(plan.name);
      await selectGravityOptionByTrigger(page, planDialog.getByTestId('plan-account-trigger'), plan.account);
      await selectGravityOptionByTrigger(page, planDialog.getByTestId('plan-csv-template-trigger'), plan.template);

      await planDialog.getByTestId('modal-save-btn').click();
      await page.waitForTimeout(500);
      await expect(page.getByText(plan.name).first()).toBeVisible();

      // Click Edit Plan to open rules dashboard
      const planRow = page.locator(`tr:has-text("${plan.name}")`).first();
      await planRow.locator('button').first().click();

      let editPlanDialog = page.locator('[role="dialog"]').first();
      await expect(editPlanDialog).toBeVisible();

      // Configure rules
      for (const rule of plan.rules) {
        await editPlanDialog.getByRole('button', { name: 'Add Rule' }).click();
        let ruleDialog = page.locator('[role="dialog"]').last();
        await expect(ruleDialog).toBeVisible();

        await selectGravityOptionByTrigger(page, ruleDialog.getByTestId('rule-field-trigger'), rule.field);
        await ruleDialog.getByTestId('rule-pattern-input').fill(rule.pattern);

        if (rule.ignore) {
          await ruleDialog.getByTestId('rule-ignore-checkbox').click();
        } else {
          if (rule.usePayee) {
            await ruleDialog.getByTestId('rule-use-payee').click();
            await selectGravityOptionByTrigger(page, ruleDialog.getByTestId('payee-trigger'), rule.usePayee);
          }
          if (rule.useCategory) {
            await ruleDialog.getByTestId('rule-use-category').click();
            await selectGravityOptionByTrigger(page, ruleDialog.getByTestId('category-trigger'), rule.category);
            await selectGravityOptionByTrigger(page, ruleDialog.getByTestId('subcategory-trigger'), rule.subcategory);
          }
        }

        await ruleDialog.getByRole('button', { name: 'Create Rule' }).click();
        await page.waitForTimeout(500);
      }

      // Save Plan config
      await editPlanDialog.getByTestId('modal-save-btn').click();
      await page.waitForTimeout(500);
    }


    // --- 12.3: SEQUENTIAL CSV IMPORTS AND DRY-RUN REVIEW ---
    console.log('  12.3: Executing imports and dry-runs...');
    const importsConfig = [
      { account: 'Real Estate Asset', plan: 'Abbey Road E2E Import Plan', file: abbeyRoadDynamic },
      { account: 'Visa Platinum', plan: 'Carnaby Street E2E Import Plan', file: carnabyStreetDynamic },
      { account: 'Petty Cash', plan: 'Electric Ladyland E2E Import Plan', file: electricLadylandDynamic },
      { account: 'Main Checking', plan: 'Sgt Pepper E2E Import Plan', file: sgtPepperDynamic }
    ];

    for (const imp of importsConfig) {
      console.log(`📡 Launching CSV Import sequence on ${imp.account} account...`);
      await page.locator('a').filter({ hasText: 'Accounts' }).first().click();
      await waitForTableLoaded(page);

      // Navigate to transactions list
      await page.locator('.g-table__row').filter({ hasText: imp.account }).first().click();
      await page.waitForTimeout(500);
      await expect(page.getByText(imp.account).first()).toBeVisible();

      // Launch import modal
      await page.getByRole('button', { name: /Import CSV/i }).click();
      let importModal = page.locator('.g-dialog').first();
      await expect(importModal).toBeVisible();

      // Select plan
      await selectGravityOptionByTrigger(page, importModal.locator('.g-select-control').first(), imp.plan);

      // Upload file
      await importModal.locator('input[type="file"]').setInputFiles(imp.file);
      await page.waitForTimeout(500);

      // Import
      await importModal.locator('.g-dialog-footer button').filter({ hasText: /^Import$/ }).click();
      await page.waitForTimeout(1500); // Wait for matches to run

      // Review unmatched Dry Run
      console.log(`🔍 Validating unmatched transactions Dry Run modal for ${imp.account}...`);
      await expect(page.getByText(new RegExp(`${imp.account}.* - Edit Transaction`))).toBeVisible();

      // Close Dry Run
      console.log('🧹 Closing the dry-run review modal to reset state...');
      await page.locator('.g-dialog').last().locator('button').filter({ hasText: 'Cancel' }).click({ force: true });
      await page.waitForTimeout(500);
      await expect(page.getByText(new RegExp(`${imp.account}.* - Edit Transaction`))).toBeHidden();
    }

    // --- 12.4: TEST BALANCE RECONCILIATION WARNING FLOW ---
    console.log('🔍 Testing balance reconciliation mismatch warning flow...');

    // Generate a single-transaction CSV that matches perfectly to bypass wizard
    const sgtPepperSingleRecon = path.resolve(__dirname, '../csv/sgt_pepper_single_recon.csv');
    const todayDate = new Date();
    const dStr = String(todayDate.getDate()).padStart(2, '0');
    const mStr = String(todayDate.getMonth() + 1).padStart(2, '0');
    const yStr = todayDate.getFullYear();
    const dateFormatted = `${dStr}/${mStr}/${yStr}`;
    createSingleTransactionCsv(sgtPepperSingleRecon, dateFormatted);
    
    // Launch import modal again
    await page.getByRole('button', { name: /Import CSV/i }).click();
    let reconModal = page.locator('.g-dialog').first();
    await expect(reconModal).toBeVisible();

    // Select plan
    await selectGravityOptionByTrigger(page, reconModal.locator('.g-select-control').first(), 'Sgt Pepper E2E Import Plan');

    // Upload file
    await reconModal.locator('input[type="file"]').setInputFiles(sgtPepperSingleRecon);

    // Enter mismatching balances to trigger warning
    await reconModal.locator('input[placeholder="e.g. 0.00 or -100.00"]').fill('1000.00');
    await reconModal.locator('input[placeholder="e.g. 100.00 or -150.00"]').fill('2000.00');
    await page.waitForTimeout(500);

    // Click Import
    await reconModal.locator('.g-dialog-footer button').filter({ hasText: /^Import$/ }).click();
    await page.waitForTimeout(1500);

    // Verify warning dialog is displayed
    const reconcileWarningDialog = page.locator('.g-dialog').filter({ hasText: 'Balance Reconciliation Warning' }).first();
    await expect(reconcileWarningDialog).toBeVisible();
    await expect(reconcileWarningDialog.getByText('Statement Balance Mismatch')).toBeVisible();

    // Click Cancel Import
    console.log('🧹 Canceling import on reconciliation warning...');
    await reconcileWarningDialog.locator('.g-dialog-footer button').filter({ hasText: 'Cancel Import' }).click();
    await page.waitForTimeout(500);
    await expect(reconcileWarningDialog).toBeHidden();

    // Close the initial import modal
    console.log('🧹 Closing the initial import modal...');
    await reconModal.locator('.g-dialog-footer button').filter({ hasText: 'Cancel' }).click();
    await page.waitForTimeout(500);
    await expect(reconModal).toBeHidden();

    // Cleanup generated file
    try {
      fs.unlinkSync(sgtPepperSingleRecon);
    } catch (e) {}

    console.log('🎉 Unified user journey test suite successfully executed.');
    await page.waitForTimeout(2000);
  });
});
