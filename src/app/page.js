'use client';

import { useState, useEffect, useCallback } from 'react';
import UploadZone from '@/components/UploadZone';
import StatsBar from '@/components/StatsBar';
import ScrapePanel from '@/components/ScrapePanel';
import FilterBar from '@/components/FilterBar';
import ProfileTable from '@/components/ProfileTable';

const DEFAULT_FILTERS = {
  search: '',
  scraped: '',
  isPrivate: '',
  isVerified: '',
  followersMin: '',
  followersMax: '',
};

export default function Dashboard() {
  const [profiles, setProfiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [sort, setSort] = useState('followersCount');
  const [order, setOrder] = useState('desc');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50, sort, order });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      
      const res = await fetch('/api/profiles?' + params.toString());
      const data = await res.json();
      setProfiles(data.profiles || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setStats(data.stats || null);
    } catch (e) {
      console.error('Load error:', e);
    }
    setLoading(false);
  }, [page, sort, order, filters]);

  useEffect(() => { loadData(); }, [loadData]);

  // Debounce search
  const [searchTimeout, setSearchTimeout] = useState(null);
  function handleFilterChange(newFilters) {
    if (newFilters.search !== filters.search) {
      if (searchTimeout) clearTimeout(searchTimeout);
      const t = setTimeout(() => { setFilters(newFilters); setPage(1); }, 400);
      setSearchTimeout(t);
    } else {
      setFilters(newFilters);
      setPage(1);
    }
  }

  function handleSort(key, ord) { setSort(key); setOrder(ord); setPage(1); }

  async function handleDeleteAll() {
    if (!confirm('⚠️ Delete ALL profiles? This cannot be undone.')) return;
    await fetch('/api/profiles', { method: 'DELETE' });
    loadData();
  }

  async function handleCleanup() {
    if (!confirm('🧹 Remove all deactivated profiles and profiles with no follower/following data?')) return;
    try {
      const res = await fetch('/api/profiles/cleanup', { method: 'POST' });
      const data = await res.json();
      alert(`Removed ${data.removed} profiles. ${data.remaining} remaining.`);
      loadData();
    } catch (e) {
      alert('Cleanup failed: ' + e.message);
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    window.open('/api/export?' + params.toString(), '_blank');
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-title">
          <span className="logo-icon">📊</span>
          <h1>IG Follower Analyzer</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>📥 Export CSV</button>
          <button className="btn btn-accent btn-sm" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? '✕ Close' : '📁 Upload File'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleCleanup}>🧹 Clean Up</button>
          <button className="btn btn-danger btn-sm" onClick={handleDeleteAll}>🗑️ Clear All</button>
        </div>
      </header>

      {/* Upload Section */}
      {showUpload && (
        <section className="section">
          <UploadZone onSuccess={() => { loadData(); setShowUpload(false); }} />
        </section>
      )}

      {/* Scrape Controls */}
      <section className="section">
        <ScrapePanel onComplete={loadData} onRefresh={loadData} />
      </section>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Filters */}
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* Table */}
      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <ProfileTable
          profiles={profiles}
          total={total}
          page={page}
          pages={pages}
          onPageChange={setPage}
          sort={sort}
          order={order}
          onSort={handleSort}
        />
      )}
    </div>
  );
}
