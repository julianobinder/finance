import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { ConfirmationProvider } from '@/contexts/ConfirmationContext';
import { Layout } from '@/components/Layout/Layout';
import { Home } from '@/pages/Home';
import { Accounts } from '@/pages/Accounts';
import { Transactions } from '@/pages/Transactions';
import { CSVTemplates } from '@/pages/CSVTemplates';
import ImportPlans from '@/pages/ImportPlans';
import { AccountTypes } from '@/pages/AccountTypes';
import { AccountHolders } from '@/pages/AccountHolders';
import { Currencies } from '@/pages/Currencies';
import { Titulars } from '@/pages/Titulars';
import { AccountGroups } from '@/pages/AccountGroups';
import { Categories } from '@/pages/Categories';
import { Payees } from '@/pages/Payees';
import { Settings } from '@/pages/Settings';
import { Reports } from '@/pages/Reports';

// App core routing configuration
function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NavigationProvider>
        <ConfirmationProvider>
          <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/accounts/:accountId/transactions" element={<Transactions />} />
                <Route path="/csv-templates" element={<CSVTemplates />} />
            <Route path="/import-plans" element={<ImportPlans />} />
            <Route path="/account-types" element={<AccountTypes />} />
            <Route path="/account-holders" element={<AccountHolders />} />
            <Route path="/currencies" element={<Currencies />} />
            <Route path="/titulars" element={<Titulars />} />
            <Route path="/account-groups" element={<AccountGroups />} />
            {/* Redirect old singular route to plural */}
            <Route path="/account-group" element={<Navigate to="/account-groups" replace />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/payees" element={<Payees />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          </Layout>
        </ConfirmationProvider>
      </NavigationProvider>
    </Router>
  );
}

export default App;
