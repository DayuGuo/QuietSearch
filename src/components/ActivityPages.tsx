import { useState } from 'react';
import { ArrowUpRight, Clock3, History, Search, Trash2 } from 'lucide-react';
import { activity, localDay, useActivity } from '../lib/activity';
import type { Dictionary } from '../lib/i18n';

export function HistoryPage({
  t,
  onFill,
  onClear,
}: {
  t: Dictionary;
  onFill: (query: string) => void;
  onClear: () => void;
}) {
  const { history, preferences } = useActivity();
  const [filter, setFilter] = useState('');
  const entries = history.filter((item) =>
    item.query.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );
  return (
    <main className="workspace-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR EXPLORATIONS</span>
        <h1>{t.historyTitle}</h1>
        <p>{t.historySubtitle}</p>
      </div>
      <div className="page-toolbar">
        <div className="filter-input">
          <Search size={18} />
          <input
            aria-label={t.filter}
            placeholder={t.filter}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <button className="button" disabled={!history.length} onClick={onClear}>
          <Trash2 size={16} />
          {t.historyClear}
        </button>
      </div>
      {!preferences.historyEnabled && <p className="notice">{t.paused}</p>}
      {!entries.length ? (
        <div className="empty-state">
          <History size={32} />
          <h2>{t.historyEmpty}</h2>
          <p>{t.historyEmptyHint}</p>
        </div>
      ) : (
        <ul className="history-list">
          {entries.map((item, index) => (
            <li key={item.id}>
              {(index === 0 || entries[index - 1].day !== item.day) && (
                <h2 className="date-heading">{item.day === localDay() ? t.today : item.day}</h2>
              )}
              <div className="history-row">
                <Clock3 size={18} className="muted" />
                <button className="history-query" title={t.fill} onClick={() => onFill(item.query)}>
                  {item.query}
                  <span>
                    {new Date(item.at).toLocaleTimeString(
                      preferences.language === 'zh' ? 'zh-CN' : 'en-GB',
                      { hour: '2-digit', minute: '2-digit' },
                    )}
                    <i>·</i>
                    {item.mode === 'answer' ? t.searchAnswer : t.searchOnly}
                    <i>·</i>
                    {item.status === 'success'
                      ? `${item.resultCount} ${t.resultLabel}`
                      : item.status === 'pending'
                        ? t.pending
                        : item.status === 'cancelled'
                          ? t.cancelled
                          : t.failed}
                  </span>
                </button>
                <button
                  className="icon-button"
                  title={t.fill}
                  aria-label={`${t.fill}: ${item.query}`}
                  onClick={() => onFill(item.query)}
                >
                  <ArrowUpRight size={18} />
                </button>
                <button
                  className="icon-button muted"
                  aria-label={`${t.delete}: ${item.query}`}
                  onClick={() => activity.remove(item.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function UsagePage({ t, onClear }: { t: Dictionary; onClear: () => void }) {
  const { days, preferences } = useActivity();
  const today = days.find((item) => item.day === localDay());
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    const day = localDay(date);
    return { date, day, searches: days.find((item) => item.day === day)?.searches ?? 0 };
  });
  const max = Math.max(1, ...week.map((item) => item.searches));
  return (
    <main className="workspace-page">
      <div className="page-heading">
        <span className="eyebrow">A LITTLE EVERY DAY</span>
        <h1>{t.usageTitle}</h1>
        <p>{t.usageSubtitle}</p>
      </div>
      <div className="usage-topline">
        <h2>
          {t.today} <span className="muted">{localDay()}</span>
        </h2>
        <button className="text-button" disabled={!days.length} onClick={onClear}>
          {t.usageClear}
        </button>
      </div>
      <div className="stats-grid">
        {[
          [t.searches, today?.searches ?? 0],
          [t.successful, today?.successes ?? 0],
          [t.returned, today?.results ?? 0],
          [t.aiRequests, today?.aiRequests ?? 0],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="usage-chart">
        <div className="section-heading">
          <h2>{t.last7}</h2>
          <span className="small muted">{t.totalSearches}</span>
        </div>
        <svg
          viewBox="0 0 700 210"
          role="img"
          aria-label={`${t.last7}: ${week.map((item) => `${item.day}: ${item.searches}`).join(', ')}`}
        >
          <line x1="12" y1="174" x2="688" y2="174" className="chart-baseline" />
          {week.map((item, index) => {
            const height = item.searches ? Math.max(8, (item.searches / max) * 120) : 3;
            return (
              <g key={item.day}>
                <rect
                  x={index * 98 + 28}
                  y={174 - height}
                  width="56"
                  height={height}
                  rx="5"
                  className={index === 6 ? 'chart-bar today-bar' : 'chart-bar'}
                />
                <text
                  x={index * 98 + 56}
                  y={160 - height}
                  textAnchor="middle"
                  className="chart-value"
                >
                  {item.searches}
                </text>
                <text x={index * 98 + 56} y="200" textAnchor="middle" className="chart-label">
                  {item.date.toLocaleDateString(preferences.language === 'zh' ? 'zh-CN' : 'en-GB', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </text>
              </g>
            );
          })}
        </svg>
      </section>
      <div className="section-heading">
        <h2>{t.daily}</h2>
        <span className="small muted">
          {t.tokens}:{' '}
          {days
            .reduce((sum, item) => sum + item.promptTokens + item.completionTokens, 0)
            .toLocaleString()}
        </span>
      </div>
      {!days.length ? (
        <p className="notice">{t.noUsage}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.day}</th>
                <th>{t.searches}</th>
                <th>{t.successful}</th>
                <th>{t.returned}</th>
                <th>{t.aiRequests}</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((item) => (
                <tr key={item.day}>
                  <td>{item.day}</td>
                  <td>{item.searches}</td>
                  <td>{item.successes}</td>
                  <td>{item.results}</td>
                  <td>{item.aiRequests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="fine-print">{t.usageNote}</p>
    </main>
  );
}
