import { useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Globe2,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react';
import type { SearchResponse, SearchResult } from '../../shared/contracts';
import type { SummaryState } from '../hooks/useSearch';
import { errorMessage, type Dictionary } from '../lib/i18n';
import { orderResults, type ResultOrder } from '../lib/results';

export function CitedText({ text, results }: { text: string; results: SearchResult[] }) {
  return (
    <>
      {text.split(/(\[\d{1,3}\])/g).map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return part;
        const source = results.find((result) => result.id === Number(match[1]));
        return source ? (
          <a
            className="citation"
            href={source.url}
            title={source.title}
            key={index}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.id}
          </a>
        ) : (
          part
        );
      })}
    </>
  );
}

export function Results({
  result,
  summary,
  t,
  language,
  pageSize,
  onStop,
  onRetry,
}: {
  result: SearchResponse;
  summary: SummaryState;
  t: Dictionary;
  language: 'zh' | 'en';
  pageSize: 10 | 20;
  onStop: () => void;
  onRetry: () => void;
}) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'error'>('idle');
  const [order, setOrder] = useState<ResultOrder>('default');
  const [pages, setPages] = useState(1);
  const ordered = orderResults(result.results, order);
  const visible = ordered.slice(0, pages * pageSize);
  const remaining = ordered.length - visible.length;
  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(summary.text);
      setCopy('done');
    } catch {
      setCopy('error');
    }
  }
  return (
    <div className="results-content">
      <div className="results-meta">
        <span className="active-tab">
          <Globe2 size={16} />
          {t.search}
        </span>
        <span>
          {result.results.length} {t.resultLabel}
        </span>
        <span>{result.mode === 'answer' ? t.searchAnswer : t.searchOnly}</span>
      </div>
      <div className="result-controls">
        <label htmlFor="result-order">{t.sortLabel}</label>
        <select
          id="result-order"
          value={order}
          onChange={(event) => {
            setOrder(event.target.value as ResultOrder);
            setPages(1);
          }}
        >
          <option value="default">{t.sortDefault}</option>
          <option value="score">{t.sortScore}</option>
          <option value="authority">{t.sortAuthority}</option>
          <option value="date">{t.sortDate}</option>
        </select>
      </div>
      <details className="ranking-details">
        <summary>{t.rankingDetails}</summary>
        <p>{t.rankingExplanation}</p>
        <p>{t.sortingScope}</p>
        {result.requestedCount !== undefined && (
          <p className="retrieval-counts">
            {t.requested}: {result.requestedCount} · {t.received}: {result.receivedCount} ·{' '}
            {t.discarded}: {result.discardedCount} · {t.retained}: {result.results.length}
          </p>
        )}
        <p>
          {t.apiLimitHint} {t.lowResultHint}
        </p>
        <p>{t.queryTips}</p>
        <a
          href="https://api-docs.deepseek.com/api/search/"
          target="_blank"
          rel="noopener noreferrer"
        >
          DeepSeek Search API
        </a>
      </details>
      {result.mode === 'answer' && order !== 'default' && (
        <p className="small muted summary-order-note">{t.summarySortHint}</p>
      )}
      {result.mode === 'answer' && summary.status !== 'idle' && (
        <section className="answer-panel" aria-label={t.answer}>
          <div className="answer-header">
            <h2>
              <Sparkles size={19} />
              {t.answer}
            </h2>
            <div className="button-row">
              {summary.status === 'loading' ? (
                <button className="small-button" onClick={onStop}>
                  <Square size={13} />
                  {t.stop}
                </button>
              ) : (
                <>
                  {summary.text && (
                    <button
                      className="icon-button"
                      aria-label={t.copy}
                      onClick={() => void copyAnswer()}
                    >
                      {copy === 'done' ? <Check size={17} /> : <Copy size={17} />}
                    </button>
                  )}
                  {['error', 'cancelled'].includes(summary.status) && (
                    <button className="small-button" onClick={onRetry}>
                      <RotateCcw size={14} />
                      {t.retry}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {summary.text ? (
            <div className="answer-text">
              <CitedText text={summary.text} results={result.results} />
              {summary.status === 'loading' && (
                <span className="stream-cursor" aria-hidden="true" />
              )}
            </div>
          ) : summary.status === 'loading' ? (
            <p className="muted loading-inline">
              <LoaderCircle size={15} className="spin" />
              {t.generating}
            </p>
          ) : null}
          {summary.status === 'error' && (
            <p className="error-message" role="status">
              {t.answerFailed} {errorMessage(summary.error ?? 'STREAM_ERROR', language)}
            </p>
          )}
          {summary.status === 'cancelled' && <p className="small muted">{t.cancelled}</p>}
          {summary.truncated && <p className="small muted">{t.truncated}</p>}
          <p className="answer-disclaimer">{t.basedOn}</p>
          {copy !== 'idle' && (
            <p className="small" role="status">
              {copy === 'done' ? t.copied : t.copyFailed}
            </p>
          )}
        </section>
      )}
      {!result.results.length ? (
        <div className="empty-state">
          <Globe2 size={32} />
          <h2>{t.noResults}</h2>
          <p>{t.noResultsHint}</p>
        </div>
      ) : (
        <ol className="result-list">
          {visible.map((item) => (
            <li key={item.id} id={`source-${item.id}`}>
              <div className="result-source">
                <span className="site-icon">
                  <Globe2 size={15} />
                </span>
                <div>
                  <span>{item.siteName}</span>
                  <span className="result-host">
                    {new URL(item.url).hostname.replace(/^www\./, '')}
                  </span>
                </div>
                <span className="source-number">{String(item.id).padStart(2, '0')}</span>
              </div>
              <a className="result-title" href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              <p className="result-snippet">
                {item.date && (
                  <time dateTime={item.date}>
                    {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(item.date))}{' '}
                    ·{' '}
                  </time>
                )}
                {item.snippet}
              </p>
              {(item.relevanceScore != null || item.authority != null) && (
                <p className="result-signals">
                  {item.relevanceScore != null && (
                    <span>
                      {t.scoreLabel} {item.relevanceScore.toFixed(2)} / 3
                    </span>
                  )}
                  {item.authority != null && (
                    <span>
                      {t.authorityLabel} {item.authority} / 4
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {result.results.length > 0 && (
        <div className="more-results">
          <p className="small muted" role="status">
            {t.showing} {visible.length} / {result.results.length} {t.resultLabel}
          </p>
          {remaining > 0 ? (
            <>
              <button
                className="button load-more-button"
                onClick={() => setPages((previous) => previous + 1)}
              >
                {t.loadMore} (+{Math.min(pageSize, remaining)})<ChevronDown size={17} />
              </button>
              <p className="small muted">{t.expandHint}</p>
            </>
          ) : (
            <p className="small muted">
              {t.allShown} {t.apiLimitHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
