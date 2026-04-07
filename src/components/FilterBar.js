'use client';

export default function FilterBar({ filters, onChange }) {
  function update(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="filter-bar">
      <div className="filter-search">
        <span className="search-icon">🔎</span>
        <input
          className="input"
          type="text"
          placeholder="Search username or name..."
          value={filters.search}
          onChange={e => update('search', e.target.value)}
        />
      </div>

      <div className="filter-group">
        <select className="input input-sm" value={filters.scraped} onChange={e => update('scraped', e.target.value)}>
          <option value="">All Status</option>
          <option value="true">Scraped</option>
          <option value="false">Pending</option>
        </select>
      </div>

      <div className="filter-group">
        <select className="input input-sm" value={filters.isPrivate} onChange={e => update('isPrivate', e.target.value)}>
          <option value="">All Privacy</option>
          <option value="true">Private</option>
          <option value="false">Public</option>
        </select>
      </div>

      <div className="filter-group">
        <select className="input input-sm" value={filters.isVerified} onChange={e => update('isVerified', e.target.value)}>
          <option value="">All Verify</option>
          <option value="true">Verified ✓</option>
          <option value="false">Not Verified</option>
        </select>
      </div>

      <div className="filter-group filter-range">
        <input
          className="input input-sm"
          type="number"
          placeholder="Followers min"
          value={filters.followersMin}
          onChange={e => update('followersMin', e.target.value)}
        />
        <span className="range-sep">–</span>
        <input
          className="input input-sm"
          type="number"
          placeholder="max"
          value={filters.followersMax}
          onChange={e => update('followersMax', e.target.value)}
        />
      </div>

      <button className="btn btn-ghost btn-sm" onClick={() => onChange({
        search: '', scraped: '', isPrivate: '', isVerified: '', followersMin: '', followersMax: ''
      })}>
        ✕ Clear
      </button>
    </div>
  );
}
