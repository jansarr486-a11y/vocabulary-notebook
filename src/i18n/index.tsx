import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { fa } from './fa';

export type Lang = 'en' | 'fa';

const DICTS: Record<Lang, Record<string, string>> = { en, fa };
export const LANGS: Lang[] = ['en', 'fa'];

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

interface I18nValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  t: (key: string, vars?: Vars) => string;
  setLang: (lang: Lang) => void;
}

const DIRS = { en: 'ltr', fa: 'rtl' } as const;

const I18nContext = createContext<I18nValue | null>(null);

const LANG_KEY = 'appLanguage';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === 'fa' ? 'fa' : 'en';
  });

  const dir = DIRS[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const dict = DICTS[lang];
      const template = dict[key] ?? en[key] ?? key;
      return interpolate(template, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, dir, t, setLang }), [lang, dir, t, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** Wrap a number/latin fragment so it stays readable inside RTL text. */
export function Ltr({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
      {children}
    </span>
  );
}
