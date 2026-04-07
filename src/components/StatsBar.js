'use client';

export default function StatsBar({ stats }) {
  if (!stats) return null;

  const cards = [
    { icon: '👥', value: stats.totalProfiles, label: 'Total Profiles' },
    { icon: '✅', value: stats.scraped, label: 'Scraped' },
    { icon: '⏳', value: stats.unscraped, label: 'Pending' },
    { icon: '🔒', value: stats.privateCount, label: 'Private' },
    { icon: '✓', value: stats.verified, label: 'Verified' },
  ];

  return (
    <div className="stats-grid">
      {cards.map((card, i) => (
        <div key={i} className="stat-card">
          <div className="stat-icon">{card.icon}</div>
          <div className="stat-value">{formatNum(card.value)}</div>
          <div className="stat-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return (n || 0).toLocaleString();
}
