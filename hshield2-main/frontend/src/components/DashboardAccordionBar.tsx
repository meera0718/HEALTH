import React from 'react';
import AccordionGallery from './AccordionGallery';
import type { AccordionItem } from './AccordionGallery';

interface DashboardAccordionBarProps {
  activeTab: string;
  onSelectTab: (id: string) => void;
}

export const DashboardAccordionBar: React.FC<DashboardAccordionBarProps> = ({
  activeTab,
  onSelectTab
}) => {
  const dashboardItems: AccordionItem[] = [
    {
      id: 'command',
      label: '01 COMMAND CENTER',
      image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=900&q=80',
      alt: 'Command Center Dashboard Overview'
    },
    {
      id: 'patients',
      label: '02 PATIENT COHORT',
      image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80',
      alt: 'Patient Cohort Diagnostics'
    },
    {
      id: 'honeypot',
      label: '04 HONEYPOT SIMULATOR',
      image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=900&q=80',
      alt: 'Honeypot Deception Simulator'
    },
    {
      id: 'pipeline',
      label: '05 DETECTION PIPELINE',
      image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=900&q=80',
      alt: 'Security Detection Observability Pipeline'
    },
    {
      id: 'devices',
      label: '06 LIVE DEVICES',
      image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=900&q=80',
      alt: 'Live Medical Devices SOC'
    },
    {
      id: 'twin',
      label: '07 3D DIGITAL TWIN',
      image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=900&q=80',
      alt: 'Hospital 3D Digital Twin'
    },
    {
      id: 'report',
      label: '08 SECURITY REPORT',
      image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=900&q=80',
      alt: 'Security Report Overview'
    }
  ];

  return (
    <div className="w-full px-2 sm:px-6 pt-3 sm:pt-4 pb-2 relative z-20 overflow-x-hidden">
      <div className="max-w-7xl mx-auto bg-[#0b0f19]/80 border border-white/10 rounded-2xl p-2.5 sm:p-3 backdrop-blur-xl shadow-2xl overflow-x-auto">
        <div className="flex items-center justify-between px-2 sm:px-3 pb-2 border-b border-white/10 mb-2 font-mono text-xs">
          <div className="flex items-center gap-2 text-cyan-400 font-bold tracking-wider uppercase text-[10px] sm:text-[11px] truncate">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>
            <span className="truncate">SOC DASHBOARDS // ACCORDION GALLERY NAVIGATOR</span>
          </div>
          <span className="text-slate-400 text-[10px] hidden md:block">
            CLICK OR HOVER PANEL TO EXPAND & SWITCH DASHBOARD
          </span>
        </div>

        <AccordionGallery
          items={dashboardItems}
          activeId={activeTab}
          onSelectTab={onSelectTab}
          height={120}
          expandRatio={0.42}
          accentColor="#38bdf8"
          overlayColor="#060010"
          textColor="#ffffff"
          gap={8}
          radius={12}
          tilt={4}
          trigger="click"
        />
      </div>
    </div>
  );
};
