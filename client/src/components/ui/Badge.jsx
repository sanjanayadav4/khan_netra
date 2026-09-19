const MAP = {
  red:    'badge-red',
  yellow: 'badge-yellow',
  green:  'badge-green',
  blue:   'badge-blue',
  gray:   'badge-gray',
  orange: 'badge-orange',
  purple: 'badge-purple',
  teal:   'badge-teal',
};

const DOT = {
  red:'bg-red-500', yellow:'bg-amber-500', green:'bg-green-500',
  blue:'bg-sky-500', gray:'bg-slate-400',  orange:'bg-orange-500',
  purple:'bg-purple-500', teal:'bg-teal-500',
};

export default function Badge({ children, color = 'gray', className = '', dot = false }) {
  return (
    <span className={`${MAP[color] || 'badge-gray'}${className ? ' '+className : ''}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[color] || 'bg-slate-400'}`}/>}
      {children}
    </span>
  );
}
