import { test, expect } from '@playwright/test';
import { waitForTableLoaded } from '../helpers/test-utils';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Capture Screenshots', () => {
  test('navigates through all menus and captures screenshots', async ({ page }) => {
    test.setTimeout(120000);
    // Set a clean landscape viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // Step 1: Load sample database from Settings
    console.log('Navigating to Settings to load sample database...');
    await page.goto('/settings');
    await expect(page.getByText('Database Backup').first()).toBeVisible();

    console.log('Clicking Load Sample Database...');
    await page.getByRole('button', { name: 'Load Sample Database' }).first().click();
    await page.getByRole('button', { name: 'Yes, Load Sample Database' }).first().click();

    console.log('Waiting for Database Reinitialization Complete modal...');
    await expect(page.getByText('Database Reinitialized').first()).toBeVisible({ timeout: 60000 });
    
    // Click OK on the complete dialog
    await page.getByRole('button', { name: 'OK' }).first().click();
    console.log('Sample database initialized successfully.');

    // Ensure the output folder exists
    const imagesDir = path.join(__dirname, '../../images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Capture screenshots of each view
    const views = [
      { name: 'dashboard', path: '/' },
      { name: 'accounts', path: '/accounts' },
      { name: 'transactions', path: '/accounts/1/transactions' },
      { name: 'csv_templates', path: '/csv-templates' },
      { name: 'csv_import_plans', path: '/import-plans' },
      { name: 'categories', path: '/categories' },
      { name: 'reports', path: '/reports' },
      { name: 'settings', path: '/settings' },
    ];

    for (const view of views) {
      console.log(`Navigating to ${view.path}...`);
      await page.goto(view.path);
      
      // Wait for table or standard content to be loaded
      await waitForTableLoaded(page);
      
      // Additional view-specific waits to settle animations or chart renders
      if (view.name === 'dashboard') {
        await expect(page.getByText('Consolidated Net Worth').first()).toBeVisible();
        await page.waitForTimeout(1500);
      } else if (view.name === 'reports') {
        // Wait for reports view charts to render
        await page.waitForTimeout(2500);
      } else if (view.name === 'accounts') {
        await expect(page.getByText('Alice Checking').first()).toBeVisible();
        await page.waitForTimeout(1000);
      } else if (view.name === 'transactions') {
        await expect(page.getByText('Alice Smith').first()).toBeVisible();
        await page.waitForTimeout(1000);
      } else {
        await page.waitForTimeout(1000);
      }

      console.log(`Taking screenshot for ${view.name}...`);
      const screenshotPath = path.join(imagesDir, `${view.name}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`Saved screenshot to ${screenshotPath}`);
    }
  });
});
