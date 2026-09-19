import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar  from './Navbar';
import clsx    from 'clsx';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor:'var(--bg-base)' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}/>

      <div
        className={clsx('flex flex-col flex-1 min-w-0 transition-all duration-300')}
        style={{ marginLeft: collapsed ? '4rem' : '15rem' }}
      >
        <Navbar onMenuToggle={() => setCollapsed(c => !c)} sidebarCollapsed={collapsed}/>

        <main
          className="flex-1 overflow-y-auto"
          style={{ padding:'1.25rem 1.5rem' }}
        >
          <div style={{ maxWidth:'1600px', margin:'0 auto' }}>
            <Outlet/>
          </div>
        </main>
      </div>
    </div>
  );
}
