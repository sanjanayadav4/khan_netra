function scoreColor(s) {
  if (s >= 80) return { text:'text-green-600',  bar:'bg-green-500'  };
  if (s >= 60) return { text:'text-amber-600',  bar:'bg-amber-500'  };
  return             { text:'text-red-600',     bar:'bg-red-500'    };
}

export default function ScoreBar({ score, label, showLabel = true, height = 'h-2' }) {
  const pct = Math.min(100, Math.max(0, parseFloat(score) || 0));
  const { text, bar } = scoreColor(pct);
  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between mb-1.5">
          {label && <span className="text-[11px] font-medium" style={{ color:'var(--text-muted)' }}>{label}</span>}
          <span className={`text-[11px] font-bold ${text}`}>{pct.toFixed(1)}%</span>
        </div>
      )}
      <div className={`score-bar-track ${height}`}>
        <div className={`score-bar-fill ${bar}`} style={{ width:`${pct}%` }}/>
      </div>
    </div>
  );
}
