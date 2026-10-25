// Panel UI dictionary. Default language is English; Japanese is opt-in
// and persisted in chrome.storage.local ("tokotter.locale").
export type Locale = 'en' | 'ja';

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
];

const en = {
  'app.tagline': 'Inspect, tokens & clones — 100% local',
  'tab.inspect': 'Inspect',
  'tab.tokens': 'Tokens',
  'tab.clone': 'Clone',
  'tab.library': 'Library',
  'tab.settings': 'Settings',
  'scan.start': 'Scan this page',
  'scan.scanning': 'Scanning…',
  'scan.rescan': 'Re-scan',
  'scan.empty': 'Open any web page, then press Scan. Nothing leaves this device.',
  'inspect.hint': 'Click an element to pin it. Inspecting is unlimited.',
  'inspect.copyCss': 'Copy CSS',
  'inspect.copyTailwind': 'Copy Tailwind',
  'inspect.copied': 'Copied.',
  'tokens.generate': 'Generate & Download',
  'tokens.regenerate': 'Regenerate & Download',
  'tokens.generating': 'Building your token pack…',
  'tokens.done': 'Token pack downloaded to this device.',
  'tokens.formats': 'DESIGN.md · tokens.json · theme.css · tailwind-v4.css · _tokens.scss + extras',
  'clone.build': 'Build clone & download',
  'clone.building': 'Cloning…',
  'clone.done': 'Clone downloaded to this device.',
  'clone.preview': 'Preview',
  'library.empty': 'No captures yet. Scans you save appear here.',
  'library.open': 'Open',
  'library.delete': 'Delete',
  'library.download': 'Download again',
  'settings.language': 'Language',
  'settings.about': 'tokotter is fully local. No account, no server, no telemetry.',
  'settings.storage': 'Local storage used',
  'settings.clear': 'Delete all local data',
  'common.download': 'Download',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'error.scan': 'The page could not be scanned. Grant access and try again.',
  'error.download': 'The file could not be written to disk.',
} as const;

export type MsgKey = keyof typeof en;

const ja: Record<MsgKey, string> = {
  'app.tagline': '検証・トークン・クローン — 完全ローカル',
  'tab.inspect': '検証',
  'tab.tokens': 'トークン',
  'tab.clone': 'クローン',
  'tab.library': 'ライブラリ',
  'tab.settings': '設定',
  'scan.start': 'このページをスキャン',
  'scan.scanning': 'スキャン中…',
  'scan.rescan': '再スキャン',
  'scan.empty': 'Webページを開いてスキャンを押してください。データが外部に送信されることはありません。',
  'inspect.hint': '要素をクリックで固定。検証は無制限です。',
  'inspect.copyCss': 'CSSをコピー',
  'inspect.copyTailwind': 'Tailwindをコピー',
  'inspect.copied': 'コピーしました。',
  'tokens.generate': '生成してダウンロード',
  'tokens.regenerate': '再生成してダウンロード',
  'tokens.generating': 'トークンパックを構築中…',
  'tokens.done': 'トークンパックをダウンロードしました。',
  'tokens.formats': 'DESIGN.md・tokens.json・theme.css・tailwind-v4.css・_tokens.scss + 追加ファイル',
  'clone.build': 'クローンを作成してダウンロード',
  'clone.building': 'クローン作成中…',
  'clone.done': 'クローンをダウンロードしました。',
  'clone.preview': 'プレビュー',
  'library.empty': 'まだキャプチャがありません。保存したスキャンがここに表示されます。',
  'library.open': '開く',
  'library.delete': '削除',
  'library.download': '再ダウンロード',
  'settings.language': '言語',
  'settings.about': 'tokotterは完全ローカル動作です。アカウント・サーバ・計測送信はありません。',
  'settings.storage': 'ローカル使用量',
  'settings.clear': 'ローカルデータをすべて削除',
  'common.download': 'ダウンロード',
  'common.cancel': 'キャンセル',
  'common.close': '閉じる',
  'error.scan': 'ページをスキャンできませんでした。アクセスを許可して再試行してください。',
  'error.download': 'ファイルを書き込めませんでした。',
};

export const STRINGS: Record<Locale, Record<MsgKey, string>> = { en, ja };

export function t(locale: Locale, key: MsgKey): string {
  return STRINGS[locale][key] ?? STRINGS.en[key] ?? key;
}
