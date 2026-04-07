'use client';

export default function ProfileTable({ profiles, total, page, pages, onPageChange, sort, order, onSort }) {
  const columns = [
    { key: 'username', label: 'Username', sortable: true },
    { key: 'fullName', label: 'Full Name', sortable: true },
    { key: 'followersCount', label: 'Followers', sortable: true },
    { key: 'followingCount', label: 'Following', sortable: true },
    { key: 'postsCount', label: 'Posts', sortable: true },
    { key: 'isPrivate', label: 'Privacy', sortable: true },
    { key: 'isVerified', label: 'Verified', sortable: true },
    { key: 'lastScrapedAt', label: 'Scraped', sortable: true },
  ];

  function handleSort(key) {
    if (!onSort) return;
    const newOrder = sort === key && order === 'desc' ? 'asc' : 'desc';
    onSort(key, newOrder);
  }

  function formatCount(val) {
    if (val === -1 || val === null || val === undefined) return <span className="count-unknown">—</span>;
    if (val >= 1_000_000) return <span className="count-high">{(val / 1_000_000).toFixed(1)}M</span>;
    if (val >= 100_000) return <span className="count-high">{(val / 1_000).toFixed(0)}K</span>;
    if (val >= 10_000) return <span className="count-medium">{(val / 1_000).toFixed(1)}K</span>;
    if (val >= 1_000) return <span className="count-medium">{val.toLocaleString()}</span>;
    return <span className="count-low">{val.toLocaleString()}</span>;
  }

  if (!profiles || profiles.length === 0) {
    return (
      <div className="table-container">
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No profiles yet</h3>
          <p>Upload your Instagram following file to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>Profiles</h2>
        <span className="table-count">{total.toLocaleString()} total</span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={sort === col.key ? 'sorted' : ''}
                >
                  {col.label}
                  {sort === col.key && (
                    <span className="sort-arrow">{order === 'desc' ? '▼' : '▲'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p, idx) => (
              <tr key={p.username + idx}>
                <td>
                  <a
                    href={`https://instagram.com/${p.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="username-link"
                  >
                    @{p.username}
                  </a>
                </td>
                <td>{p.fullName || <span className="not-scraped">—</span>}</td>
                <td className="count-cell">{formatCount(p.followersCount)}</td>
                <td className="count-cell">{formatCount(p.followingCount)}</td>
                <td className="count-cell">{formatCount(p.postsCount)}</td>
                <td>
                  {p.lastScrapedAt ? (
                    p.isPrivate
                      ? <span className="badge badge-private">🔒 Private</span>
                      : <span className="badge badge-yes">Public</span>
                  ) : <span className="not-scraped">—</span>}
                </td>
                <td>
                  {p.lastScrapedAt ? (
                    p.isVerified
                      ? <span className="badge badge-verified">✓ Yes</span>
                      : <span className="badge badge-no">No</span>
                  ) : <span className="not-scraped">—</span>}
                </td>
                <td>
                  {p.lastScrapedAt
                    ? <span className="badge badge-yes">✅</span>
                    : <span className="badge badge-pending">⏳</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pagination">
          <button onClick={() => onPageChange(1)} disabled={page <= 1}>«</button>
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}>‹</button>
          <span className="pagination-info">Page {page} of {pages}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= pages}>›</button>
          <button onClick={() => onPageChange(pages)} disabled={page >= pages}>»</button>
        </div>
      )}
    </div>
  );
}
