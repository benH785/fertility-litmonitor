export default function TopicFilter({ topics, counts, active, onSelect }) {
  // Only show topics that appear in this digest, sorted by priority then count
  const entries = Object.entries(counts).map(([key, count]) => {
    const meta = topics[key] || { label: key, priority: "low" };
    return { key, count, label: meta.label, priority: meta.priority };
  });

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  entries.sort((a, b) => {
    const p = priorityOrder[a.priority] - priorityOrder[b.priority];
    return p !== 0 ? p : b.count - a.count;
  });

  if (entries.length === 0) return null;

  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <div>
      <p className="smallcaps mb-3">Topics</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          className="pill"
          data-active={active === "all"}
          onClick={() => onSelect("all")}
        >
          All <span className="text-muted-soft">{total}</span>
        </button>
        {entries.map((t) => (
          <button
            key={t.key}
            className="pill"
            data-active={active === t.key}
            onClick={() => onSelect(t.key)}
            title={`${t.label} (priority: ${t.priority})`}
          >
            {t.priority === "high" && (
              <span className="text-accent">★</span>
            )}
            {t.label} <span className="text-muted-soft">{t.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
