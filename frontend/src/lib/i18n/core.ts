import english from "./messages/en.json";

export const languages = { en: "English", el: "Ελληνικά", ru: "Русский", he: "עברית" } as const;
export type Locale = keyof typeof languages;
export const defaultLocale: Locale = "en";
export const localeCookie = "trustpay-language";
export const locales = Object.keys(languages) as Locale[];

const formats = { en: "en-GB", el: "el-CY", ru: "ru-RU", he: "he-IL" } satisfies Record<Locale, string>;
export const direction = (locale: Locale) => locale === "he" ? "rtl" : "ltr";
export const isLocale = (value: unknown): value is Locale => typeof value === "string" && Object.hasOwn(languages, value);
export const resolveLocale = (value: unknown): Locale => isLocale(value) ? value : defaultLocale;

type English = typeof english;
type Key = keyof English;
export type MessageKey = { [K in Key]: English[K] extends string ? K : never }[Key];
export type PluralKey = Exclude<Key, MessageKey>;
export type Catalog = Partial<{ [K in Key]: English[K] extends string ? string : Partial<Record<Intl.LDMLPluralRule, string>> }>;
type Params = Record<string, string | number | null | undefined>;

const getGreek = () => import("./messages/el.json").then(module => module.default);
const getRussian = () => import("./messages/ru.json").then(module => module.default);
const getHebrew = () => import("./messages/he.json").then(module => module.default);
export const loadCatalog = (locale: Locale): Promise<Catalog> => (
  { en: () => Promise.resolve(english), el: getGreek, ru: getRussian, he: getHebrew }[locale]()
);

const englishKeys = new Map<string, MessageKey>(Object.entries(english).flatMap(([key, value]) =>
  typeof value === "string" && !value.includes("{") ? [[value, key as MessageKey]] : [],
));

const variable = /\{([\w]+)\}/g;
const interpolate = (message: string, params: Params = {}, isolate = false) => message.replace(variable, (_, name: string) => {
  const value = String(params[name] ?? "");
  return isolate && value ? `\u2068${value}\u2069` : value;
});

export function sourceText(key: MessageKey, params?: Params) {
  return interpolate(english[key], params);
}

export function createLocalizer(locale: Locale, catalog: Catalog) {
  const language = formats[locale];
  const rtl = direction(locale) === "rtl";
  const pluralRules = new Intl.PluralRules(language);
  const plainNumber = new Intl.NumberFormat(language);
  const currency = new Intl.NumberFormat(locale === "en" ? "en-IE" : language, { style: "currency", currency: "EUR" });
  const dateOnly = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  const timeOnly = new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  const lists = new Intl.ListFormat(language, { style: "long", type: "conjunction" });
  const t = (key: MessageKey, params?: Params) => interpolate(catalog[key] || english[key], params, rtl);
  const number = (value: number, options?: Intl.NumberFormatOptions) => options ? new Intl.NumberFormat(language, options).format(value) : plainNumber.format(value);
  const p = (key: PluralKey, count: number) => {
    const rule = pluralRules.select(count);
    const forms = catalog[key];
    const defaultRule = count === 1 ? "one" : "other";
    return interpolate(forms?.[rule] || forms?.other || english[key][defaultRule], { count: number(count) }, rtl);
  };
  const text = (value: string | null | undefined) => {
    const key = value ? englishKeys.get(value) : undefined;
    return key ? t(key) : (value ?? "");
  };
  return {
    locale, t, p, text, number, hasTranslation: (key: MessageKey) => Boolean(catalog[key]),
    euro: (cents: number) => currency.format(cents / 100),
    date: (value: string) => dateOnly.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)),
    dateTime: (value: string) => dateTime.format(new Date(value)),
    time: (value: string) => timeOnly.format(new Date(value)),
    list: (items: string[]) => lists.format(items),
  };
}

export type Localizer = ReturnType<typeof createLocalizer>;
