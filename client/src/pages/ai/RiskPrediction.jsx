import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import { useSearchParams } from 'react-router-dom';
import {
  FiCpu, FiAlertTriangle, FiBarChart2
} from 'react-icons/fi';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { aiApi, minesApi } from '../../services/api';
import ScoreBar from '../../components/ui/ScoreBar';
import Badge from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import clsx from 'clsx';

export default function RiskPrediction() {
  const [searchParams] = useSearchParams();
  const [mines, setMines] = useState([]);
  const [selectedMine, setSelectedMine] = useState(searchParams.get('mine') || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { minesApi.getAll({ limit: 100 }).then(r => setMines(r.data)).catch(() => {}); }, []);

  const analyze = async () => {
    if (!selectedMine) return;
    setLoading(true);
    try {
      const res = await aiApi.getRiskPrediction(selectedMine);
      setResult(res.data ?? res);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { if (selectedMine) analyze(); }, [selectedMine]);

  const riskColor = (level) => ({ CRITICAL: 'red', HIGH: 'yellow', MEDIUM: 'blue', LOW: 'green' }[level] || 'gray');
  const riskBg = (level) => ({ CRITICAL: 'bg-red-50 border-red-300', HIGH: 'bg-yellow-50 border-yellow-300', MEDIUM: 'bg-blue-50 border-blue-300', LOW: 'bg-green-50 border-green-300' }[level] || 'bg-gray-50');

  const radarData = result?.risk_factors?.map(f => ({
    subject: f.name.substring(0, 15),
    value: Math.min(100, f.value),
  })) || [];

  const barData = result?.predictions?.map(p => ({
    name: p.category,
    probability: parseFloat(p.probability).toFixed(1),
  })) || [];

  return (
    <div className="space-y-6"><BackButton className="mb-1"/>
      <div>
        <h1 className="page-title flex items-center gap-2"><FiCpu className="text-primary-600" /> AI Risk Prediction</h1>
        <p className="page-subtitle">AI-powered risk assessment and predictive analytics for mines</p>
      </div>

      <div className="card">
        <label className="label">Select Mine for Analysis</label>
        <div className="flex gap-3">
          <select value={selectedMine} onChange={e => setSelectedMine(e.target.value)} className="select flex-1">
            <option value="">Select a mine...</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.state})</option>)}
          </select>
          <button onClick={analyze} disabled={!selectedMine || loading} className="btn-primary">
            <FiCpu size={16} /> {loading ? 'Analyzing...' : 'Analyze Risk'}
          </button>
        </div>
      </div>

      {loading ? <PageLoader message="Running AI risk analysis..." /> : result && (
        <div className="space-y-6">
          {/* Risk Summary */}
          <div className={clsx('card border-2', riskBg(result.risk_level))}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-coal-900">{result.mine_name}</h2>
                <p className="text-sm text-coal-500">AI Risk Assessment Result</p>
              </div>
              <div className="text-center">
                <div className={clsx('text-4xl font-black', result.risk_level === 'CRITICAL' ? 'text-red-600' : result.risk_level === 'HIGH' ? 'text-yellow-600' : result.risk_level === 'MEDIUM' ? 'text-blue-600' : 'text-green-600')}>
                  {result.overall_risk}%
                </div>
                <Badge color={riskColor(result.risk_level)} className="mt-1">Risk Level: {result.risk_level}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-coal-400 mb-1">Overall Risk Score</p>
                <ScoreBar score={result.overall_risk} showLabel={false} />
              </div>
              <div>
                <p className="text-xs text-coal-400 mb-1">Compliance Score</p>
                <ScoreBar score={result.compliance_score} showLabel={false} />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="section-title">Risk Factor Radar</h3>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <Radar dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3 className="section-title">Incident Probability (30 days)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={v => [`${v}%`, 'Probability']} />
                  <Bar dataKey="probability" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Predictions */}
          <div className="card">
            <h3 className="section-title">Predictive Analysis</h3>
            <div className="space-y-3">
              {result.predictions.map((p, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-coal-50">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-coal-800">{p.category}</p>
                    <p className="text-xs text-coal-500">{p.description}</p>
                  </div>
                  <div className="text-right w-32">
                    <p className={clsx('text-lg font-black', parseFloat(p.probability) >= 70 ? 'text-red-600' : parseFloat(p.probability) >= 40 ? 'text-yellow-600' : 'text-green-600')}>
                      {parseFloat(p.probability).toFixed(1)}%
                    </p>
                    <ScoreBar score={p.probability} showLabel={false} height="h-1.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="card">
            <h3 className="section-title flex items-center gap-2"><FiAlertTriangle /> AI Recommendations</h3>
            <div className="space-y-3">
              {result.recommendations.map((r, i) => (
                <div key={i} className={clsx('flex items-start gap-3 p-3 rounded-lg border', r.priority === 'CRITICAL' ? 'bg-red-50 border-red-200' : r.priority === 'HIGH' ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200')}>
                  <Badge color={riskColor(r.priority)} className="shrink-0 mt-0.5">{r.priority}</Badge>
                  <p className="text-sm text-coal-700">{r.action}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Factors */}
          <div className="card">
            <h3 className="section-title flex items-center gap-2"><FiBarChart2 /> Risk Factor Breakdown</h3>
            <div className="space-y-3">
              {result.risk_factors.map((f, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-coal-600">{f.name}</span>
                    <span className={clsx('text-xs font-bold', Math.min(100, f.value) >= 50 ? 'text-red-600' : 'text-coal-600')}>
                      {Math.min(100, f.value).toFixed(0)}/{f.max}
                    </span>
                  </div>
                  <div className="w-full bg-coal-100 rounded-full h-2 overflow-hidden">
                    <div className={clsx('h-full rounded-full', Math.min(100, f.value) >= 70 ? 'bg-red-500' : Math.min(100, f.value) >= 40 ? 'bg-yellow-500' : 'bg-green-500')}
                      style={{ width: `${Math.min(100, (f.value / f.max) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
