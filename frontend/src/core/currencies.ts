/* core/currencies.ts - currency catalogue for the owner dropdown.
   Mirrors shared/src/currency.rs (same codes + order, UGX first).
   Prices are always stored as minor units (1/100 of the major unit),
   so only 0- and 2-decimal currencies are listed. */

export type CurrencyInfo = { code: string; name: string; decimals: number };

export const CURRENCIES: CurrencyInfo[] = [
  { code: "UGX", name: "Ugandan shilling", decimals: 0 },
  { code: "USD", name: "US dollar", decimals: 2 },
  { code: "EUR", name: "Euro", decimals: 2 },
  { code: "GBP", name: "Pound sterling", decimals: 2 },
  { code: "KES", name: "Kenyan shilling", decimals: 2 },
  { code: "TZS", name: "Tanzanian shilling", decimals: 2 },
  { code: "RWF", name: "Rwandan franc", decimals: 0 },
  { code: "BIF", name: "Burundian franc", decimals: 0 },
  { code: "ETB", name: "Ethiopian birr", decimals: 2 },
  { code: "SOS", name: "Somali shilling", decimals: 2 },
  { code: "ERN", name: "Eritrean nakfa", decimals: 2 },
  { code: "DJF", name: "Djiboutian franc", decimals: 0 },
  { code: "SDG", name: "Sudanese pound", decimals: 2 },
  { code: "SSP", name: "South Sudanese pound", decimals: 2 },
  { code: "CDF", name: "Congolese franc", decimals: 2 },
  { code: "AED", name: "UAE dirham (Dubai)", decimals: 2 },
  { code: "SAR", name: "Saudi riyal", decimals: 2 },
  { code: "QAR", name: "Qatari riyal", decimals: 2 },
  { code: "INR", name: "Indian rupee", decimals: 2 },
  { code: "PKR", name: "Pakistani rupee", decimals: 2 },
  { code: "LKR", name: "Sri Lankan rupee", decimals: 2 },
  { code: "IRR", name: "Iranian rial", decimals: 2 },
  { code: "ZAR", name: "South African rand", decimals: 2 },
  { code: "NGN", name: "Nigerian naira", decimals: 2 },
  { code: "GHS", name: "Ghanaian cedi", decimals: 2 },
  { code: "JPY", name: "Japanese yen", decimals: 0 },
  { code: "CNY", name: "Chinese yuan", decimals: 2 },
  { code: "CAD", name: "Canadian dollar", decimals: 2 },
  { code: "AUD", name: "Australian dollar", decimals: 2 },
  { code: "CHF", name: "Swiss franc", decimals: 2 },
];

export const DEFAULT_CURRENCY = "UGX";

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const isCurrency = (code: string): boolean => BY_CODE.has(String(code || "").toUpperCase());

export const currencyInfo = (code: string): CurrencyInfo =>
  BY_CODE.get(String(code || "").toUpperCase()) ?? BY_CODE.get(DEFAULT_CURRENCY) as CurrencyInfo;

export const currencyDecimals = (code: string): number => currencyInfo(code).decimals;

/* `<option>` list, UGX selected by default. */
export const currencyOptions = (selected: string): string => {
  const want = isCurrency(selected) ? selected.toUpperCase() : DEFAULT_CURRENCY;
  return CURRENCIES.map((c) =>
    `<option value="${c.code}"${c.code === want ? " selected" : ""}>${c.code} - ${c.name}</option>`).join("");
};
