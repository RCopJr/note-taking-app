import {
  appConfigSchema,
  type AppConfig,
  type UpdateAppConfig,
} from '../shared/contracts.ts';

const STORAGE_KEY = 'notes:preferences:v1';

export const DEFAULT_APP_CONFIG: AppConfig = {
  leaderKey: '<Space>',
  vimKeymaps: [
    { before: 'jk', after: '<Esc>', mode: 'insert' },
    { before: 'jj', after: '<Esc>', mode: 'insert' },
  ],
  editor: {
    fontSize: 15,
    fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
    lineNumbers: true,
    livePreview: true,
    cursorScrollMarginLines: 20,
  },
  bible: {
    defaultVersion: 'ESV',
  },
};

function mergePreferences(value: unknown): AppConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(DEFAULT_APP_CONFIG);
  const candidate = value as Partial<AppConfig>;
  const parsed = appConfigSchema.safeParse({
    ...DEFAULT_APP_CONFIG,
    ...candidate,
    editor: { ...DEFAULT_APP_CONFIG.editor, ...candidate.editor },
    bible: { ...DEFAULT_APP_CONFIG.bible, ...candidate.bible },
    vimKeymaps: Array.isArray(candidate.vimKeymaps) ? candidate.vimKeymaps : DEFAULT_APP_CONFIG.vimKeymaps,
  });
  return parsed.success ? parsed.data : structuredClone(DEFAULT_APP_CONFIG);
}

export function loadPreferences(): AppConfig {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored ? mergePreferences(JSON.parse(stored)) : structuredClone(DEFAULT_APP_CONFIG);
  } catch {
    return structuredClone(DEFAULT_APP_CONFIG);
  }
}

export function savePreferences(current: AppConfig, updates: UpdateAppConfig): AppConfig {
  const updated = appConfigSchema.parse({
    ...current,
    ...updates,
    editor: { ...current.editor, ...updates.editor },
    bible: { ...current.bible, ...updates.bible },
    vimKeymaps: updates.vimKeymaps ?? current.vimKeymaps,
  });
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
