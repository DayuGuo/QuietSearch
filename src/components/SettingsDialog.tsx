import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { PublicConfig, SearchProvider } from '../../shared/contracts';
import { AppError } from '../../shared/contracts';
import { activity, useActivity } from '../lib/activity';
import { checkKey } from '../lib/api';
import { errorMessage, type Dictionary } from '../lib/i18n';
import { Dialog } from './Dialog';

function KeyConnection({
  t,
  config,
  apiKey,
  onKey,
  provider,
  showAIRole = false,
}: {
  t: Dictionary;
  config: PublicConfig | null;
  apiKey: string;
  onKey: (key: string) => void;
  provider: SearchProvider;
  showAIRole?: boolean;
}) {
  const { preferences } = useActivity();
  const kagi = provider === 'kagi';
  const id = `${provider}-key`;
  const [draft, setDraft] = useState(apiKey),
    [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function changed(value: string) {
    controller.current?.abort();
    setTesting(false);
    setDraft(value);
    setNotice('');
    setError('');
  }
  async function test() {
    if (testing) return;
    const abort = new AbortController();
    controller.current = abort;
    setTesting(true);
    setError('');
    setNotice('');
    try {
      await checkKey(
        config?.keyMode === 'server' ? '' : draft.trim(),
        AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
      );
      if (!abort.signal.aborted) setNotice(t.testSuccess);
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(
          errorMessage(
            failure instanceof AppError ? failure.code : 'UPSTREAM_ERROR',
            preferences.language,
          ),
        );
    } finally {
      if (!abort.signal.aborted) setTesting(false);
    }
  }
  return (
    <section className="settings-section">
      <h3>
        <KeyRound size={19} />
        {kagi ? t.kagiKeyTitle : t.keyTitle}
      </h3>
      {!kagi && showAIRole && <p className="small muted">{t.aiRole}</p>}
      {config?.keyMode === 'server' ? (
        <p className="muted">{t.privateMode}</p>
      ) : (
        <>
          <p className="muted">{kagi ? t.kagiKeyIntro : t.keyIntro}</p>
          <div className="setup-step">
            <strong>{t.step1}</strong>
            <p>{kagi ? t.kagiStep1Text : t.step1Text}</p>
            <a
              href={kagi ? 'https://kagi.com/api/keys' : 'https://platform.deepseek.com/api_keys'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.getKey}
              <ExternalLink size={14} />
            </a>
          </div>
          <div className="setup-step">
            <strong>{t.step2}</strong>
            <label className="field-label" htmlFor={id}>
              {kagi ? 'Kagi API Key' : t.tokenLabel}
            </label>
            <div className="key-input">
              <input
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={draft}
                maxLength={512}
                placeholder={kagi ? 'Kagi API Key' : 'sk-…'}
                aria-describedby={`${id}-hint ${id}-privacy`}
                onChange={(event) => changed(event.target.value)}
              />
              <button
                className="icon-button"
                type="button"
                aria-label={visible ? t.hideKey : t.showKey}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p id={`${id}-hint`} className="small muted">
              {kagi ? t.kagiTokenHint : t.tokenHint}
            </p>
          </div>
          <p className="privacy-note" id={`${id}-privacy`}>
            <ShieldCheck size={17} />
            {t.keyPrivacy}
          </p>
        </>
      )}
      {kagi && <p className="small muted">{t.kagiValidation}</p>}
      <div className="button-row">
        {config?.keyMode !== 'server' && (
          <button
            className="button primary"
            disabled={draft.trim().length < 8 || !config || testing}
            onClick={() => {
              onKey(draft.trim());
              setNotice(t.savedKey);
              setVisible(false);
            }}
          >
            <Check size={17} />
            {kagi ? t.saveKagiKey : t.saveKey}
          </button>
        )}
        {!kagi && (
          <button
            className="button"
            disabled={
              testing ||
              !config ||
              config.summaryAvailable === false ||
              (config.keyMode !== 'server' && draft.trim().length < 8)
            }
            onClick={() => void test()}
          >
            {testing ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
            {testing ? t.testing : t.testKey}
          </button>
        )}
        {apiKey && (
          <button
            className="text-button danger"
            onClick={() => {
              changed('');
              onKey('');
              setNotice(t.removedKey);
            }}
          >
            {t.removeKey}
          </button>
        )}
      </div>
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function SettingsDialog({
  t,
  config,
  apiKey,
  kagiKey,
  provider,
  onProvider,
  onKagiKey,
  onKey,
  onClose,
  onClear,
}: {
  t: Dictionary;
  config: PublicConfig | null;
  apiKey: string;
  kagiKey: string;
  provider: SearchProvider;
  onProvider: (provider: SearchProvider) => void;
  onKagiKey: (key: string) => void;
  onKey: (key: string) => void;
  onClose: () => void;
  onClear: (target: 'history' | 'usage' | 'all') => void;
}) {
  const { preferences, storageAvailable } = useActivity();
  return (
    <Dialog title={t.settings} closeLabel={t.close} onClose={onClose}>
      <section className="settings-section">
        <h3>{t.engineTitle}</h3>
        <p className="muted">{t.engineHint}</p>
        <fieldset className="engine-options">
          <legend className="sr-only">{t.engineTitle}</legend>
          {(['deepseek', 'kagi'] as const).map((engine) => {
            const available = !config?.searchProviders || config.searchProviders.includes(engine);
            return (
              <label key={engine} className={provider === engine ? 'selected' : ''}>
                <input
                  type="radio"
                  name="search-engine"
                  value={engine}
                  checked={provider === engine}
                  disabled={!config || !available}
                  onChange={() => onProvider(engine)}
                />
                <span>{engine === 'kagi' ? 'Kagi' : 'DeepSeek'}</span>
                {!available && <small>{t.engineUnavailable}</small>}
              </label>
            );
          })}
        </fieldset>
      </section>
      {provider === 'kagi' && (
        <KeyConnection
          key="kagi"
          t={t}
          config={config}
          apiKey={kagiKey}
          onKey={onKagiKey}
          provider="kagi"
        />
      )}
      <KeyConnection
        key="deepseek"
        t={t}
        config={config}
        apiKey={apiKey}
        onKey={onKey}
        provider="deepseek"
        showAIRole={provider === 'kagi'}
      />
      <section className="settings-section">
        <h3>{t.appearance}</h3>
        <div className="settings-grid">
          <div>
            <label htmlFor="theme">{t.theme}</label>
            <select
              id="theme"
              value={preferences.theme}
              onChange={(event) =>
                activity.setPreferences({ theme: event.target.value as typeof preferences.theme })
              }
            >
              <option value="system">{t.system}</option>
              <option value="light">{t.light}</option>
              <option value="dark">{t.dark}</option>
            </select>
          </div>
          <div>
            <label htmlFor="language">{t.language}</label>
            <select
              id="language"
              value={preferences.language}
              onChange={(event) =>
                activity.setPreferences({ language: event.target.value as 'zh' | 'en' })
              }
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label htmlFor="count">{t.count}</label>
            <select
              id="count"
              value={preferences.count}
              onChange={(event) =>
                activity.setPreferences({ count: Number(event.target.value) as 10 | 20 })
              }
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>
        <p className="small muted batch-setting-hint">{t.countHint}</p>
      </section>
      <section className="settings-section">
        <h3>{t.privacy}</h3>
        <label className="toggle-row">
          <span>
            <strong>{t.historyToggle}</strong>
            <small>{t.historyToggleHint}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.historyEnabled}
            onChange={(event) => activity.setPreferences({ historyEnabled: event.target.checked })}
          />
        </label>
        <p className="small muted">{t.localExplanation}</p>
        {!storageAvailable && (
          <p role="status" className="error-message">
            {t.storageWarning}
          </p>
        )}
        <div className="button-row">
          <button className="button" onClick={() => onClear('history')}>
            <Trash2 size={16} />
            {t.historyClear}
          </button>
          <button className="button" onClick={() => onClear('usage')}>
            {t.usageClear}
          </button>
        </div>
        <button className="text-button danger reset-button" onClick={() => onClear('all')}>
          {t.reset}
        </button>
        <p className="small muted">{t.resetHint}</p>
        <div className="fine-print">
          <p>{t.triggerRule}</p>
          <p>{t.privacyFlow}</p>
        </div>
      </section>
    </Dialog>
  );
}
