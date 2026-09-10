import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface CurrencyLookup {
  currency_id: number;
  name: string;
  iso_code: string;
  symbol: string;
}

interface DisplaySettingsValue {
  defaultLocale: string;
  defaultCurrencyId: number | null;
  defaultCurrencySymbol: string | null;
  currencies: CurrencyLookup[];
  loading: boolean;
}

const DEFAULTS: DisplaySettingsValue = {
  defaultLocale: 'en-US',
  defaultCurrencyId: null,
  defaultCurrencySymbol: null,
  currencies: [],
  loading: true,
};

const DisplaySettingsContext = createContext<DisplaySettingsValue>(DEFAULTS);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<DisplaySettingsValue>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [configRes, currenciesRes] = await Promise.all([
          fetch('/api/settings/config/'),
          fetch('/api/accounts/currencies/'),
        ]);
        const config = await configRes.json();
        const currenciesData = await currenciesRes.json();
        const currencies: CurrencyLookup[] = currenciesData.results || [];
        const defaultCurrencyId = config.default_currency_id ? Number(config.default_currency_id) : null;
        const defaultCurrency = defaultCurrencyId
          ? currencies.find((c) => c.currency_id === defaultCurrencyId)
          : undefined;

        if (!cancelled) {
          setValue({
            defaultLocale: config.default_locale || 'en-US',
            defaultCurrencyId,
            defaultCurrencySymbol: defaultCurrency?.symbol || null,
            currencies,
            loading: false,
          });
        }
      } catch {
        if (!cancelled) setValue((prev) => ({ ...prev, loading: false }));
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>;
}

export function useDisplaySettings() {
  return useContext(DisplaySettingsContext);
}
