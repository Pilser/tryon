/* core/countries.ts - dial-code catalogue for the owner WhatsApp field.
   Mirrors shared/src/currency.rs in spirit (same code+order idea, UGX /
   +256 first as the shop default). Purely presentational: nothing here
   touches the network. The number is stored as E.164 digits (country code
   + national number WITHOUT a leading 0), e.g. 256755304241. */

export type CountryCode = { cc: string; name: string };

export const COUNTRY_CODES: CountryCode[] = [
  { cc: "256", name: "Uganda +256" },
  { cc: "254", name: "Kenya +254" },
  { cc: "255", name: "Tanzania +255" },
  { cc: "250", name: "Rwanda +250" },
  { cc: "257", name: "Burundi +257" },
  { cc: "251", name: "Ethiopia +251" },
  { cc: "252", name: "Somalia +252" },
  { cc: "291", name: "Eritrea +291" },
  { cc: "253", name: "Djibouti +253" },
  { cc: "249", name: "Sudan +249" },
  { cc: "211", name: "South Sudan +211" },
  { cc: "243", name: "DR Congo +243" },
  { cc: "242", name: "Congo +242" },
  { cc: "971", name: "UAE +971" },
  { cc: "966", name: "Saudi Arabia +966" },
  { cc: "974", name: "Qatar +974" },
  { cc: "91", name: "India +91" },
  { cc: "92", name: "Pakistan +92" },
  { cc: "94", name: "Sri Lanka +94" },
  { cc: "98", name: "Iran +98" },
  { cc: "27", name: "South Africa +27" },
  { cc: "234", name: "Nigeria +234" },
  { cc: "233", name: "Ghana +233" },
  { cc: "1", name: "USA/Canada +1" },
  { cc: "44", name: "UK +44" },
  { cc: "33", name: "France +33" },
  { cc: "49", name: "Germany +49" },
  { cc: "39", name: "Italy +39" },
  { cc: "34", name: "Spain +34" },
  { cc: "55", name: "Brazil +55" },
  { cc: "52", name: "Mexico +52" },
  { cc: "86", name: "China +86" },
  { cc: "81", name: "Japan +81" },
  { cc: "82", name: "South Korea +82" },
  { cc: "61", name: "Australia +61" },
  { cc: "64", name: "New Zealand +64" },
];

export const DEFAULT_COUNTRY_CODE = "256";

const BY_CC = new Map(COUNTRY_CODES.map((c) => [c.cc, c]));

export const isCountryCode = (cc: string): boolean => BY_CC.has(String(cc || "").trim());

/** `cc` is in the catalogue, else the Uganda default. */
export const cleanCountryCode = (cc: string): string =>
  isCountryCode(cc) ? cc.trim() : DEFAULT_COUNTRY_CODE;

/** `<option>` list, `selected` country code pre-selected. */
export const countryCodeOptions = (selected: string): string => {
  const want = cleanCountryCode(selected);
  return COUNTRY_CODES.map((c) =>
    `<option value="${c.cc}"${c.cc === want ? " selected" : ""}>${c.name}</option>`).join("");
};

/** Digits only from the national number, with any leading 0 removed
    (E.164 national numbers never start with 0). */
export const cleanNational = (national: string): string => {
  const d = String(national || "").replace(/\D/g, "");
  return d.startsWith("0") ? d.slice(1) : d;
};

/** Combine country code + national number into stored E.164 digits. */
export const combineWa = (cc: string, national: string): string =>
  cleanCountryCode(cc) + cleanNational(national);

/** Split stored digits into { cc, national } (best-effort: picks the
    longest catalogue prefix). Falls back to the default code. */
export const splitWa = (full: string): { cc: string; national: string } => {
  const d = String(full || "").replace(/\D/g, "");
  let best: { cc: string; national: string } | null = null;
  for (const c of COUNTRY_CODES) {
    if (d.startsWith(c.cc) && (!best || c.cc.length > best.cc.length)) {
      best = { cc: c.cc, national: d.slice(c.cc.length) };
    }
  }
  if (best) return best;
  return { cc: DEFAULT_COUNTRY_CODE, national: d };
};

/** A plausible WhatsApp target: E.164 digits, 8..15 long. */
export const isPlausibleWa = (digits: string): boolean => {
  const d = String(digits || "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15;
};
