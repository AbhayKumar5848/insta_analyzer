'use client';

import { useEffect, useState, useRef } from 'react';

export default function ScrapePanel({ onComplete, onRefresh }) {
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState(null);
  const esRef = useRef(null);

  function connectSSE() {
    if (esRef.current) esRef.current.close();
    
    const es = new EventSource('/api/scrape/progress');
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);
        setScraping(data.active);

        if (!data.active && data.completed > 0 && data.completed >= data.total) {
          es.close();
          esRef.current = null;
          if (onComplete) onComplete();
        }
      } catch (e) {}
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };
  }

  async function handleStart(force = false) {
    setScraping(true);
    try {
      const res = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        setScraping(false);
        return;
      }
      if (data.total === 0) {
        alert('No profiles to scrape. Upload a file first or use "Force Re-scrape".');
        setScraping(false);
        return;
      }
      connectSSE();
    } catch (e) {
      alert('Failed to start scraping: ' + e.message);
      setScraping(false);
    }
  }

  async function handleStop() {
    try {
      await fetch('/api/scrape/stop', { method: 'POST' });
    } catch (e) {}
    setScraping(false);
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (onRefresh) onRefresh();
  }

  useEffect(() => {
    return () => { if (esRef.current) esRef.current.close(); };
  }, []);

  const pct = progress?.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="scrape-panel">
      {/* Controls */}
      <div className="scrape-controls">
        <button
          className="btn btn-primary"
          onClick={() => handleStart(false)}
          disabled={scraping}
        >
          {scraping ? '⏳ Scraping...' : '🚀 Start Scraping'}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => handleStart(true)}
          disabled={scraping}
          title="Re-scrape all profiles, including already-scraped ones"
        >
          🔄 Force Re-scrape All
        </button>
        {scraping && (
          <button className="btn btn-danger btn-sm" onClick={handleStop}>
            ⏹ Stop
          </button>
        )}
      </div>

      {/* Progress */}
      {progress && (progress.active || progress.completed > 0) && (
        <div className="scrape-progress">
          <div className="scrape-progress-header">
            <h3>
              {progress.stoppedReason && !progress.active
                ? `⚠️ ${progress.stoppedReason}`
                : progress.paused
                  ? '⏸️ Paused — Cooling Down'
                  : progress.active
                    ? '🔄 Scraping Profiles...'
                    : '✅ Scraping Complete'
              }
            </h3>
            <span className="scrape-stats">
              {progress.successes} ✅ / {progress.failures} ❌ / {progress.total} total
            </span>
          </div>

          <div className="scrape-badges">
            {progress.wave > 0 && (
              <span className="scrape-badge badge-wave">
                📦 Wave {progress.wave}/{progress.totalWaves}
              </span>
            )}
            {progress.estimatedTimeLeft && progress.active && (
              <span className="scrape-badge badge-eta">
                ⏱️ ~{progress.estimatedTimeLeft} left
              </span>
            )}
            {progress.consecutiveFailures > 0 && (
              <span className="scrape-badge badge-warn">
                ⚠️ {progress.consecutiveFailures} consecutive fails
              </span>
            )}
          </div>

          <div className="progress-bar">
            <div
              className={`progress-bar-fill ${progress.paused ? 'progress-paused' : ''}`}
              style={{ width: pct + '%' }}
            />
          </div>

          {progress.pauseReason && progress.paused && (
            <div className="scrape-pause-info">
              <span>⏳ {progress.pauseReason}</span>
            </div>
          )}

          <div className="progress-current">
            {progress.active ? (
              <span>Scraping: <strong>@{progress.currentUsername}</strong> ({progress.completed}/{progress.total})</span>
            ) : (
              <span>{progress.completed}/{progress.total} profiles processed</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
