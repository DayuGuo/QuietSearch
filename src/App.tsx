import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  ChartNoAxesColumnIncreasing,
  Check,
  Clock3,
  History,
  KeyRound,
  LoaderCircle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { PublicConfig, SearchProvider } from '../shared/contracts';
import { useSearch } from './hooks/useSearch';
import { activity, localDay, useActivity } from './lib/activity';
import { config as loadConfig } from './lib/api';
import { dictionary, errorMessage } from './lib/i18n';
import { HistoryPage, UsagePage } from './components/ActivityPages';
import { Dialog } from './components/Dialog';
import { Results } from './components/Results';
import { SettingsDialog } from './components/SettingsDialog';

type Page = 'search' | 'history' | 'usage';

export default function App() {
  const { preferences, history, days, storageAvailable } = useActivity();
  const t = dictionary(preferences.language);
  const [page, setPage] = useState<Page>('search'),
    [settings, setSettings] = useState(false);
  const [input, setInput] = useState(''),
    [keys, setKeys] = useState({ deepseek: '', kagi: '' });
  const [config, setConfig] = useState<PublicConfig | null>(null),
    [configError, setConfigError] = useState(false),
    [reload, setReload] = useState(0);
  const [clearTarget, setClearTarget] = useState<'history' | 'usage' | 'all' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null),
    composing = useRef(false);
  const flow = useSearch();
  const providers = config?.searchProviders ?? ['deepseek', 'kagi'];
  const provider = providers.includes(preferences.searchProvider)
    ? preferences.searchProvider
    : (providers[0] ?? preferences.searchProvider);
  const providerName = provider === 'kagi' ? 'Kagi' : 'DeepSeek';
  const previewAnswer = /[?？]$/u.test(input.trim()),
    ready = config?.keyMode === 'server' ? providers.includes(provider) : Boolean(keys[provider]);
  const canSummarize =
    config?.keyMode === 'server' ? config.summaryAvailable !== false : Boolean(keys.deepseek);
  const hasSearch = Boolean(flow.result || flow.loading || flow.error);
  const today = days.find((item) => item.day === localDay());
  const clearSearch = flow.clear;
  useEffect(() => {
    clearSearch();
  }, [provider, clearSearch]);

  useEffect(() => {
    const abort = new AbortController();
    void loadConfig(abort.signal)
      .then(setConfig)
      .catch(() => {
        if (!abort.signal.aborted) setConfigError(true);
      });
    return () => abort.abort();
  }, [reload]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      document.documentElement.dataset.theme =
        preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme;
    };
    update();
    media.addEventListener('change', update);
    document.documentElement.lang = preferences.language === 'zh' ? 'zh-CN' : 'en';
    return () => media.removeEventListener('change', update);
  }, [preferences.theme, preferences.language]);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setPage('search');
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, []);

  function fill(query: string) {
    setInput(query);
    setPage('search');
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function submit() {
    if (!config) return;
    if (!ready) {
      setSettings(true);
      return;
    }
    void flow.submit(input, {
      provider,
      searchKey: keys[provider],
      summaryKey: keys.deepseek,
      canSummarize,
    });
  }
  function setKey(value: string, engine: SearchProvider = 'deepseek') {
    if (engine === provider) flow.clear();
    else flow.stop();
    setKeys((previous) => ({ ...previous, [engine]: value }));
  }
  function clear() {
    if (clearTarget === 'history') activity.clearHistory();
    if (clearTarget === 'usage') activity.clearUsage();
    if (clearTarget === 'all') {
      activity.clearAll();
      flow.clear();
      setKeys({ deepseek: '', kagi: '' });
      setInput('');
      setPage('search');
    }
    setClearTarget(null);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t.search}
      </a>
      <header className="site-header">
        <button
          className="wordmark"
          onClick={() => {
            setPage('search');
            flow.clear();
            setInput('');
          }}
          aria-label="QuietSearch"
        >
          <span className="brand-symbol">
            <Search size={19} strokeWidth={2.5} />
          </span>
          Quiet<span>Search</span>
        </button>
        <nav aria-label={preferences.language === 'zh' ? '主导航' : 'Main navigation'}>
          {(
            [
              { id: 'search', icon: Search, label: t.search },
              { id: 'history', icon: History, label: t.history },
              { id: 'usage', icon: ChartNoAxesColumnIncreasing, label: t.usage },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-button ${page === item.id ? 'selected' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="today-pill" onClick={() => setPage('usage')}>
            {t.today}
            <strong>{today?.searches ?? 0}</strong>
            <span>{t.search}</span>
          </button>
          <button
            className="nav-button settings-button"
            aria-label={t.settings}
            onClick={() => setSettings(true)}
          >
            <Settings2 size={19} />
            <span>{t.settings}</span>
          </button>
        </div>
      </header>
      <div id="main" className="main-wrapper">
        {page === 'search' ? (
          <main className={`search-page ${hasSearch ? 'with-results' : 'home'}`}>
            {!hasSearch && (
              <div className="home-heading">
                <span className="eyebrow">LESS NOISE. MORE DISCOVERY.</span>
                <h1>{t.headline}</h1>
                <p>{t.tagline}</p>
              </div>
            )}
            <div className="search-area">
              <form
                className={`search-form ${flow.loading ? 'is-loading' : ''}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!composing.current) submit();
                }}
              >
                <Search size={22} className="search-leading" aria-hidden="true" />
                <label className="sr-only" htmlFor="search-input">
                  {t.search}
                </label>
                <input
                  id="search-input"
                  ref={inputRef}
                  value={input}
                  placeholder={t.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={2048}
                  onCompositionStart={() => {
                    composing.current = true;
                  }}
                  onCompositionEnd={() => {
                    composing.current = false;
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
                    )
                      event.preventDefault();
                  }}
                  onChange={(event) => setInput(event.target.value)}
                />
                <button
                  type="submit"
                  className="submit-button"
                  aria-label={t.search}
                  disabled={
                    !input.trim() ||
                    !config ||
                    (flow.loading && input.trim() === flow.result?.submittedQuery)
                  }
                >
                  {flow.loading ? (
                    <LoaderCircle size={21} className="spin" />
                  ) : (
                    <ArrowUp size={22} />
                  )}
                </button>
              </form>
              <div className="search-hints">
                <button
                  className="text-button engine-indicator"
                  onClick={() => setSettings(true)}
                  aria-label={`${t.engineTitle}: ${providerName}`}
                >
                  {providerName}
                </button>
                <span className={previewAnswer ? 'mode-badge answer-mode' : 'mode-badge'}>
                  {previewAnswer ? <Sparkles size={13} /> : <Search size={13} />}
                  {previewAnswer ? t.searchAnswer : t.searchOnly}
                </span>
                <span>{previewAnswer ? t.extraTokens : t.hint}</span>
                {!hasSearch && <kbd>⌘ / Ctrl K</kbd>}
              </div>
            </div>
            {!config && (
              <div className="notice" role="status">
                {configError ? (
                  <>
                    {t.configFailed}
                    <button
                      className="text-button"
                      onClick={() => {
                        setConfigError(false);
                        setReload((value) => value + 1);
                      }}
                    >
                      {t.reload}
                    </button>
                  </>
                ) : (
                  t.configLoading
                )}
              </div>
            )}
            {!storageAvailable && <p className="notice">{t.storageWarning}</p>}
            {flow.error && (
              <p className="error-banner" role="alert">
                {errorMessage(flow.error, preferences.language)}
                {['MISSING_KEY', 'INVALID_KEY'].includes(flow.error) && (
                  <button className="text-button" onClick={() => setSettings(true)}>
                    {t.settings}
                  </button>
                )}
              </p>
            )}
            {!hasSearch && (
              <>
                <div className="suggestions">
                  <span>{t.sample}</span>
                  {[t.sample1, t.sample2, t.sample3].map((example) => (
                    <button key={example} onClick={() => fill(example)}>
                      {example}
                      <ArrowUp size={12} />
                    </button>
                  ))}
                </div>
                {!ready ? (
                  <section className="connection-card">
                    <div className="connection-icon">
                      <KeyRound size={21} />
                    </div>
                    <div>
                      <h2>{provider === 'kagi' ? t.kagiBeginTitle : t.beginTitle}</h2>
                      <p>{t.beginText}</p>
                    </div>
                    <button className="button primary" onClick={() => setSettings(true)}>
                      {t.connect}
                      <ArrowRight size={16} />
                    </button>
                  </section>
                ) : (
                  <p className="connection-status">
                    <Check size={15} />
                    {providerName} ·{' '}
                    {config?.keyMode === 'server'
                      ? t.serverConnected
                      : provider === 'kagi'
                        ? t.keyConfigured
                        : t.connected}
                    <span>·</span>
                    {t.ready}
                  </p>
                )}
                {history.length > 0 && (
                  <section className="recent-section">
                    <div className="section-heading">
                      <h2>
                        <Clock3 size={16} />
                        {t.recent}
                      </h2>
                      <button className="text-button" onClick={() => setPage('history')}>
                        {t.allHistory}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    {history.slice(0, 3).map((item) => (
                      <button className="recent-row" onClick={() => fill(item.query)} key={item.id}>
                        <Search size={15} />
                        <span>{item.query}</span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </section>
                )}
              </>
            )}
            {flow.loading && (
              <div className="search-loading" role="status">
                <LoaderCircle size={20} className="spin" />
                <span>{t.searchLoading}</span>
                <button className="text-button" onClick={flow.stop}>
                  {t.stop}
                </button>
              </div>
            )}
            {flow.result && (
              <Results
                key={flow.result.requestId}
                result={flow.result}
                summary={flow.summary}
                canAnswer={canSummarize}
                t={t}
                language={preferences.language}
                pageSize={preferences.count}
                onStop={flow.stop}
                onRetry={() => {
                  if (!canSummarize) setSettings(true);
                  else void flow.retry(keys.deepseek);
                }}
              />
            )}
          </main>
        ) : page === 'history' ? (
          <HistoryPage t={t} onFill={fill} onClear={() => setClearTarget('history')} />
        ) : (
          <UsagePage t={t} onClear={() => setClearTarget('usage')} />
        )}
      </div>
      <footer className="site-footer">
        <div className="footer-meta">
          <span>
            <ShieldCheck size={14} />
            {t.footer}
          </span>
          <button className="text-button" onClick={() => setSettings(true)}>
            {t.footerPrivacy}
          </button>
        </div>
        <nav className="footer-links" aria-label={t.footerLinks}>
          <a href="https://anotherdayu.com/" target="_blank" rel="noopener noreferrer">
            {t.authorSite}
          </a>
          <a
            href="https://github.com/DayuGuo/QuietSearch"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.githubRepository}
          </a>
        </nav>
      </footer>
      <div className="sr-only" role="status" aria-live="polite">
        {flow.loading
          ? t.searchLoading
          : flow.result
            ? `${flow.result.results.length} ${t.resultLabel}. ${flow.summary.status === 'done' ? t.answer : ''}`
            : ''}
      </div>
      {settings && (
        <SettingsDialog
          t={t}
          config={config}
          apiKey={keys.deepseek}
          kagiKey={keys.kagi}
          provider={provider}
          onProvider={(engine) => {
            flow.clear();
            activity.setPreferences({ searchProvider: engine });
          }}
          onKagiKey={(value) => setKey(value, 'kagi')}
          onKey={setKey}
          onClose={() => setSettings(false)}
          onClear={(target) => {
            setSettings(false);
            setClearTarget(target);
          }}
        />
      )}
      {clearTarget && (
        <Dialog
          title={t.clearTitle}
          closeLabel={t.close}
          onClose={() => setClearTarget(null)}
          className="confirm-dialog"
        >
          <p>{t.clearDescription}</p>
          <div className="button-row">
            <button className="button" autoFocus onClick={() => setClearTarget(null)}>
              {t.cancel}
            </button>
            <button className="button danger-primary" onClick={clear}>
              {t.confirmClear}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
