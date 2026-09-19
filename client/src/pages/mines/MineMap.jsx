import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import clsx from 'clsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const mkIcon = (status, score) => {
  const color = status==='suspended' ? '#ef4444'
    : status==='under_inspection'    ? '#f59e0b'
    : parseFloat(score) < 60        ? '#f97316'
    : '#22c55e';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.8);box-shadow:0 0 10px ${color}60,0 2px 6px rgba(0,0,0,.5);"></div>`,
    iconSize: [16,16], iconAnchor:[8,8],
  });
};

export default function MineMap({ mines = [] }) {
  const valid  = mines.filter(m => m.latitude && m.longitude);
  const center = valid.length ? [valid[0].latitude, valid[0].longitude] : [22.5, 82.5];

  return (
    <MapContainer center={center} zoom={5} style={{ height:'100%', width:'100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {valid.map(mine => (
        <Marker key={mine.id} position={[mine.latitude, mine.longitude]}
          icon={mkIcon(mine.status, mine.compliance_score)}>
          <Popup maxWidth={260}>
            <div style={{ fontFamily:'Inter,sans-serif', fontSize:'13px' }}>
              <p style={{ fontWeight:800, marginBottom:4, color:'#f59e0b' }}>{mine.name}</p>
              <p style={{ color:'#6c757d', marginBottom:6, fontSize:'11px' }}>{mine.mine_id} · {mine.type}</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 12px', fontSize:'11px', marginBottom:8 }}>
                <span style={{ color:'#6c757d' }}>State:</span><span>{mine.state}</span>
                <span style={{ color:'#6c757d' }}>Workers:</span><span>{mine.workers_count?.toLocaleString()}</span>
                <span style={{ color:'#6c757d' }}>Compliance:</span>
                <span style={{ fontWeight:700, color: parseFloat(mine.compliance_score)>=80?'#22c55e':parseFloat(mine.compliance_score)>=60?'#f59e0b':'#ef4444' }}>
                  {parseFloat(mine.compliance_score).toFixed(1)}%
                </span>
                <span style={{ color:'#6c757d' }}>Risk:</span>
                <span style={{ fontWeight:700, color: parseFloat(mine.risk_score)>=70?'#ef4444':'#f59e0b' }}>
                  {parseFloat(mine.risk_score).toFixed(1)}%
                </span>
              </div>
              <span style={{ padding:'2px 8px', borderRadius:999, fontSize:'10px', fontWeight:700,
                background: mine.status==='active'?'rgba(34,197,94,.2)':mine.status==='suspended'?'rgba(239,68,68,.2)':'rgba(245,158,11,.2)',
                color: mine.status==='active'?'#22c55e':mine.status==='suspended'?'#ef4444':'#f59e0b' }}>
                {mine.status.replace(/_/g,' ').toUpperCase()}
              </span>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
