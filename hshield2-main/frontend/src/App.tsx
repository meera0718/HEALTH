import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SecureGateway } from './pages/SecureGateway';
import { LogoutDashboard } from './pages/LogoutDashboard';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardAccordionBar } from './components/DashboardAccordionBar';

import { CommandCenter } from './pages/CommandCenter';
import { DetectionPipeline } from './pages/DetectionPipeline';
import { PatientDashboard } from './pages/PatientDashboard';
import { HoneypotSimulator } from './pages/HoneypotSimulator';
import { FeatureView } from './pages/FeatureView';
import { FecView } from './pages/FecView';
import { SecurityReport } from './pages/SecurityReport';
import { DevicesDashboard } from './pages/DevicesDashboard';
import { HospitalDigitalTwin } from './pages/HospitalDigitalTwin';


import GridDistortion from './components/GridDistortion';
import { NotificationsDrawer } from './components/NotificationsDrawer';

import { auth, type UnauthorizedErrorPayload } from './lib/auth';
import type { 
  Incident, 
  ActivityLog, SOCNotification 
} from './types';

const TAB_ORDER = [
  'command', 'pipeline', 'patients', 'honeypot', 'features', 'fec', 'devices', 'twin', 'report'
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
    scale: 0.99
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.35,
      ease: [0.25, 1, 0.5, 1] as const
    }
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 60 : -60,
    opacity: 0,
    scale: 0.99,
    transition: {
      duration: 0.28,
      ease: [0.25, 1, 0.5, 1] as const
    }
  })
};

export function App() {
  const [viewState, setViewState] = useState<'GATEWAY' | 'CONSOLE' | 'LOGOUT'>('GATEWAY');
  const [activeTab, setActiveTabState] = useState<string>('command');
  const [prevTab, setPrevTab] = useState<string>('command');
  const [isConsoleEntering, setIsConsoleEntering] = useState(false);
  const [isConsoleExiting, setIsConsoleExiting] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('HSX-042');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Notification Modal state
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  // const [isAttackSimulatedActive] = useState(true);

  // Global State Synchronization
  // const [devices, setDevices] = useState<MedicalDevice[]>([
  //   { id: 'ICU-MON-01', name: 'ICU Monitor 01', type: 'Patient Monitor', status: 'SECURE', risk_score: 8, last_comm: '12 sec ago', vlan: 'ICU VLAN', location: 'ICU Ward 4A', ip: '10.10.3.11' },
  //   { id: 'ICU-MON-02', name: 'ICU Monitor 02', type: 'Patient Monitor', status: 'SECURE', risk_score: 5, last_comm: '5 sec ago', vlan: 'ICU VLAN', location: 'ICU Ward 4A', ip: '10.10.3.12' },
  //   { id: 'VENT-04', name: 'Ventilator Unit 04', type: 'Critical Ventilation', status: 'SECURE', risk_score: 4, last_comm: '8 sec ago', vlan: 'ICU VLAN', location: 'ICU Ward 4B', ip: '10.10.3.40' },
  //   { id: 'INFUSION-08', name: 'Infusion Pump 08', type: 'Drug Infusion', status: 'SECURE', risk_score: 11, last_comm: '15 sec ago', vlan: 'MedIoT VLAN', location: 'Ward 2C', ip: '10.10.3.88' },
  //   { id: 'LAB-03', name: 'Lab Analyzer 03', type: 'Blood Chemistry', status: 'SECURE', risk_score: 7, last_comm: '2 sec ago', vlan: 'Lab VLAN', location: 'Central Lab', ip: '10.10.4.30' },
  //   { id: 'ER-MON-05', name: 'ER Telemetry 05', type: 'Emergency Monitor', status: 'SECURE', risk_score: 6, last_comm: '10 sec ago', vlan: 'ER VLAN', location: 'ER Trauma 01', ip: '10.10.2.55' },
  //   { id: 'PHARMACY-SRV-02', name: 'Pharmacy Dispenser 02', type: 'Medication Storage', status: 'SECURE', risk_score: 14, last_comm: '4 sec ago', vlan: 'Pharm VLAN', location: 'Pharmacy Main', ip: '10.10.5.22' },
  //   { id: 'ADMIN-PC-07', name: 'Workstation ADMIN-PC-07', type: 'Admin Workstation', status: 'ISOLATED', risk_score: 94, last_comm: '1 sec ago', vlan: 'Admin VLAN', location: 'Admin Suite 03', ip: '10.10.2.14' }
  // ]);

  const [notifications, setNotifications] = useState<SOCNotification[]>([
    { id: 'n1', type: 'CRITICAL', timestamp: '10:42:31', title: 'CRITICAL THREAT DETECTED', description: 'ADMIN-PC-07 generated a high-risk behavioral anomaly (94% Risk Score).' },
    { id: 'n2', type: 'AUTOMATED_RESPONSE', timestamp: '10:42:40', title: 'AUTOMATED RESPONSE EXECUTED', description: 'Device isolation completed for ADMIN-PC-07. Network port quarantined.' },
    { id: 'n3', type: 'FORENSIC_EVENT', timestamp: '10:42:45', title: 'FORENSIC EVIDENCE PRESERVED', description: '5 new evidence artifacts immutably hashed and preserved.' }
  ]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const handleTabChange = (newTab: string, eventId?: string, patientId?: string) => {
    const targetTab = newTab === 'detection' ? 'pipeline' : newTab;
    if (eventId) {
      setSelectedEventId(eventId);
      localStorage.setItem('healthx_latest_sim_event_id', eventId);
    }
    if (patientId) {
      setSelectedPatientId(patientId);
      localStorage.setItem('healthx_selected_patient_id', patientId);
    }
    if (targetTab === activeTab && !eventId) return;
    setPrevTab(activeTab);
    setActiveTabState(targetTab);
  };

  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail && customEvt.detail.tab) {
        handleTabChange(customEvt.detail.tab);
      }
    };
    window.addEventListener('navigate-tab', handleNav);
    return () => window.removeEventListener('navigate-tab', handleNav);
  }, [activeTab]);

  const handleAccessGranted = (targetTab?: string) => {
    if (targetTab) setActiveTabState(targetTab);
    setIsConsoleEntering(true);
    setViewState('CONSOLE');
    setTimeout(() => {
      setIsConsoleEntering(false);
    }, 700);
  };

  const handleLogout = () => {
    setIsConsoleExiting(true);
    setTimeout(() => {
      setIsConsoleExiting(false);
      setViewState('LOGOUT');
    }, 600);
  };

  // const handleToggleIsolateDevice = (deviceId: string) => {
  //   setDevices((prev) =>
  //     prev.map((d) => {
  //       if (d.id === deviceId) {
  //         const newStatus = d.status === 'ISOLATED' || d.status === 'CRITICAL' ? 'SECURE' : 'ISOLATED';
  //         const newRisk = newStatus === 'ISOLATED' ? 94 : 8;
  //         return { ...d, status: newStatus, risk_score: newRisk };
  //       }
  //       return d;
  //     })
  //   );
  // };

  const prevIndex = TAB_ORDER.indexOf(prevTab);
  const currentIndex = TAB_ORDER.indexOf(activeTab);
  const direction = currentIndex >= prevIndex ? 1 : -1;

  const [incidents] = useState<Incident[]>([
    {
      id: 'INC-0241',
      title: 'Suspicious Database Access',
      severity: 'HIGH',
      status: 'INVESTIGATING',
      start_time: '10:32',
      end_time: '10:47',
      fec_score: 72.0,
      summary: 'Anomalous database query targeting sensitive patient records following initial access via Workstation-14 and microservice API traversal.'
    },
    {
      id: 'INC-0240',
      title: 'Unauthorized API Token Refresh',
      severity: 'MEDIUM',
      status: 'RESOLVED',
      start_time: '09:10',
      end_time: '09:25',
      fec_score: 91.0,
      summary: 'Repeated JWT refresh token attempts detected from non-hospital IP range.'
    },
    {
      id: 'INC-0239',
      title: 'Exfiltration Signal on Lab Gateway',
      severity: 'HIGH',
      status: 'EVIDENCE_GAP',
      start_time: '08:05',
      end_time: '08:30',
      fec_score: 64.0,
      summary: 'Large outbound data transfer registered on laboratory network gateway.'
    }
  ]);

  // const [graphData] = useState<AttackGraphData | null>({
  //   nodes: [
  //     { id: 'ATTACKER', type: 'cyberNode', position: { x: 50, y: 150 }, data: { id: 'ATTACKER', label: 'Attacker (External)', node_type: 'Attacker', ip: '198.51.100.42', risk_state: 'compromised', evidence_count: 2, missing_evidence: '' } },
  //     { id: 'WORKSTATION-14', type: 'cyberNode', position: { x: 280, y: 150 }, data: { id: 'WORKSTATION-14', label: 'Workstation-14', node_type: 'Workstation', ip: '10.10.2.14', risk_state: 'suspicious', evidence_count: 3, missing_evidence: 'Endpoint Telemetry' } },
  //     { id: 'HOSPITAL-API', type: 'cyberNode', position: { x: 510, y: 150 }, data: { id: 'HOSPITAL-API', label: 'Hospital EHR API', node_type: 'API', ip: '10.10.4.5', risk_state: 'normal', evidence_count: 4, missing_evidence: '' } },
  //     { id: 'PATIENT-DB', type: 'cyberNode', position: { x: 740, y: 150 }, data: { id: 'PATIENT-DB', label: 'Patient DB', node_type: 'Database', ip: '10.10.5.100', risk_state: 'compromised', evidence_count: 5, missing_evidence: '' } },
  //     { id: 'FILE-STORE', type: 'cyberNode', position: { x: 970, y: 150 }, data: { id: 'FILE-STORE', label: 'Medical File Store', node_type: 'FileStore', ip: '10.10.6.20', risk_state: 'normal', evidence_count: 2, missing_evidence: '' } },
  //   ],
  //   edges: [
  //     { id: 'EDG-001', source: 'ATTACKER', target: 'WORKSTATION-14', label: 'access', animated: true, style: { stroke: '#ef4444' } },
  //     { id: 'EDG-002', source: 'WORKSTATION-14', target: 'HOSPITAL-API', label: 'API request', animated: true, style: { stroke: '#6366f1' } },
  //     { id: 'EDG-003', source: 'HOSPITAL-API', target: 'PATIENT-DB', label: 'SQL query', animated: true, style: { stroke: '#ef4444' } },
  //     { id: 'EDG-004', source: 'PATIENT-DB', target: 'FILE-STORE', label: 'transfer', animated: true, style: { stroke: '#6366f1' } },
  //   ],
  //   summary: { total_nodes: 5, total_edges: 4, compromised_nodes: ['ATTACKER', 'PATIENT-DB'], suspicious_nodes: ['WORKSTATION-14'] }
  // });

  // const [fecData] = useState<FECResult | null>({
  //   overall_fec: 72.0,
  //   stages: { "Initial Access": 92.0, "Execution": 61.0, "Lateral Movement": 48.0, "Data Access": 95.0, "Exfiltration": 76.0 },
  //   domain_status: {
  //     "Identity": { required: true, available: true, weight: 0.15, status: "Available" },
  //     "Network": { required: true, available: true, weight: 0.20, status: "Available" },
  //     "Endpoint": { required: true, available: false, weight: 0.28, status: "Missing" },
  //     "Application": { required: true, available: true, weight: 0.15, status: "Available" },
  //     "Database": { required: true, available: true, weight: 0.15, status: "Available" },
  //     "File": { required: true, available: true, weight: 0.07, status: "Available" }
  //   },
  //   missing_gaps: [{ domain: "Endpoint", impact: "Host process execution logs unavailable", weight: 0.28 }],
  //   formula: "FEC = sum(weight * availability) / sum(required_weights) * 100",
  //   provenance_trace: [
  //     { conclusion: "Initial Access verified", supported_by: ["EVT-1821", "EVT-1824"], strength: "HIGH" },
  //     { conclusion: "Workstation API Activity verified", supported_by: ["EVT-1827"], strength: "HIGH" },
  //     { conclusion: "Endpoint process creation unverified", supported_by: [], strength: "MISSING (Endpoint Gap)" },
  //     { conclusion: "Patient Database query verified", supported_by: ["EVT-1830"], strength: "HIGH" },
  //     { conclusion: "File export transfer verified", supported_by: ["EVT-1842"], strength: "MEDIUM" }
  //   ]
  // });



  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([
    { id: 1, timestamp: '09:50:00', user: 'investigator@hospital-demo.org', action: 'INCIDENT_RECONSTRUCTED', incident_id: 'INC-0241', details: 'Incident INC-0241 reconstructed' },
    { id: 2, timestamp: '09:46:12', user: 'system', action: 'GAP_IDENTIFIED', incident_id: 'INC-0241', details: 'Endpoint evidence gap identified' }
  ]);

  // When an unauthorized login attempt occurs, inject structured event into timeline & audit log
  const handleUnauthorizedDetected = (payload: UnauthorizedErrorPayload) => {
    setActivityLogs((prev) => [
      {
        id: Date.now(),
        timestamp: payload.timestamp,
        user: payload.account,
        action: 'UNAUTHORIZED_LOGIN_ATTEMPT',
        incident_id: selectedIncidentId,
        details: `Unauthorized access attempt blocked from ${payload.source}. Audit reference generated.`
      },
      ...prev
    ]);
  };

  useEffect(() => {
    if (auth.isAuthenticated()) {
      setViewState('GATEWAY');
    }
  }, []);


  if (viewState === 'GATEWAY') {
    return (
      <SecureGateway
        onAccessGranted={handleAccessGranted}
        onUnauthorizedDetected={handleUnauthorizedDetected}
      />
    );
  }

  if (viewState === 'LOGOUT') {
    return <LogoutDashboard onReEnterGateway={() => setViewState('GATEWAY')} />;
  }

  return (
    <div className="flex h-screen max-h-screen bg-[#0b0f19] text-slate-100 font-sans overflow-hidden relative">
      {/* ENTER CONSOLE TRANSITION: React Bits GridDistortion WebGL Three.js Shader Overlay */}
      <AnimatePresence>
        {isConsoleEntering && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="fixed inset-0 z-50 pointer-events-none"
          >
            <GridDistortion
              grid={16}
              mouse={0.25}
              strength={0.3}
              relaxation={0.9}
              imageSrc="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1920&q=80"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXIT CONSOLE TRANSITION: React Bits GridDistortion WebGL Three.js Shader Overlay */}
      <AnimatePresence>
        {isConsoleExiting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="fixed inset-0 z-50 pointer-events-none"
          >
            <GridDistortion
              grid={18}
              mouse={0.3}
              strength={0.35}
              relaxation={0.88}
              imageSrc="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1920&q=80"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Sidebar (Stable & Mobile Responsive) */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        onLogout={handleLogout} 
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header Bar (Stable & Fixed) */}
        <Header
          selectedIncidentId={selectedIncidentId}
          setSelectedIncidentId={setSelectedIncidentId}
          incidents={incidents}
          onLogout={handleLogout}
          onToggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)}
          unreadCount={notifications.length}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        />

        {/* Accordion Gallery Dashboard Navigator (Stable & Fixed) */}
        <DashboardAccordionBar
          activeTab={activeTab}
          onSelectTab={handleTabChange}
        />

        {/* Animated Main Dashboard Viewport Container */}
        <main className="flex-1 overflow-y-auto pb-12 relative w-full overflow-x-hidden px-2 sm:px-4">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeTab}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full min-h-full"
            >
              {activeTab === 'command' && (
                <CommandCenter
                  incidents={incidents.filter(inc => !['INC-0241', 'INC-0240', 'INC-0239', 'INC0421', 'INC0420', 'INC0439'].includes(inc.id))}
                  onSelectIncident={(id) => {
                    setSelectedIncidentId(id);
                  }}
                  activityLogs={activityLogs}
                  onSelectTab={handleTabChange}
                />
              )}


              {activeTab === 'pipeline' && (
                <DetectionPipeline 
                  selectedEventId={selectedEventId || localStorage.getItem('healthx_latest_sim_event_id') || undefined}
                  selectedPatientId={selectedPatientId || localStorage.getItem('healthx_selected_patient_id') || undefined}
                />
              )}

              {activeTab === 'patients' && (
                <PatientDashboard />
              )}

              {activeTab === 'honeypot' && (
                <HoneypotSimulator />
              )}

              {activeTab === 'features' && (
                <FeatureView />
              )}

              {activeTab === 'fec' && (
                <FecView />
              )}

              {activeTab === 'devices' && (
                <DevicesDashboard />
              )}

              {activeTab === 'twin' && (
                <HospitalDigitalTwin />
              )}

              {activeTab === 'report' && (
                <SecurityReport />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>



      {/* SOC Live Notifications Drawer */}
      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onClearNotifications={() => setNotifications([])}
      />
    </div>
  );
}
