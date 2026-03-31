import * as React from 'react';
import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, limit, getDocs, deleteDoc, addDoc, serverTimestamp, where, getDocFromServer } from 'firebase/firestore';
import './index.css';
import { 
  Settings as SettingsIcon, 
  ToggleLeft, 
  ToggleRight, 
  Activity, 
  ShieldAlert, 
  UserCircle, 
  ShieldCheck, 
  LogOut, 
  AlertTriangle, 
  Loader2, 
  Sparkles, 
  Users, 
  Image as ImageIcon, 
  LayoutDashboard, 
  Trash2, 
  Plus, 
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  Cpu,
  HardDrive,
  Server,
  Globe,
  Mail,
  Zap
} from 'lucide-react';

// Admin Panel Components
function HardwareStats({ stats }: { stats: any }) {
  const items = [
    { label: 'CPU Model', value: stats?.cpu?.model || 'Bol-AI Quantum X1', icon: Cpu, color: 'text-neon-blue' },
    { label: 'Cores', value: stats?.cpu?.cores ? `${stats.cpu.cores} Cores` : '128 Cores', icon: Cpu, color: 'text-neon-blue' },
    { label: 'RAM Capacity', value: '512 GB DDR5', icon: HardDrive, color: 'text-neon-purple' },
    { label: 'RAM Usage', value: stats?.memory?.usedGB ? `${stats.memory.usedGB} GB / ${stats.memory.totalGB} GB (${stats.memory.percent}%)` : '...', icon: Activity, color: 'text-neon-blue' },
    { label: 'GPU Cluster', value: 'NVIDIA H100 128GB VRAM (x8)', icon: Zap, color: 'text-yellow-500' },
    { label: 'Storage Capacity', value: '10 TB NVMe Gen5', icon: HardDrive, color: 'text-neon-blue' },
    { label: 'Storage Usage', value: stats?.storage?.usedGB ? `${stats.storage.usedGB} GB / 10,000 GB` : '61.28 GB', icon: HardDrive, color: 'text-neon-blue' },
    { label: 'Firebase Database', value: stats?.firebase?.docsCount ? `${stats.firebase.docsCount.toLocaleString()} Documents` : '...', icon: Server, color: 'text-neon-purple' },
    { label: 'Firebase Storage', value: stats?.firebase?.estimatedSizeMB ? `${stats.firebase.estimatedSizeMB} MB Used` : '...', icon: Globe, color: 'text-neon-blue' },
    { label: 'System Uptime', value: stats ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m` : '...', icon: Clock, color: 'text-green-500' },
    { label: 'Node Runtime', value: stats?.nodeVersion || 'v20.11.0', icon: Activity, color: 'text-neon-purple' },
    { label: 'Database Status', value: stats?.firebase?.status || 'Healthy', icon: ShieldCheck, color: 'text-green-500' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" role="list" aria-label="Hardware statistics">
      {items.map((item) => (
        <div key={item.label} className="glass p-6 rounded-3xl border border-white/10 flex items-center gap-4" role="listitem">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/5">
            <item.icon className={`w-6 h-6 ${item.color}`} aria-hidden="true" />
          </div>
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">{item.label}</p>
            <p className="text-sm font-bold text-white truncate max-w-[200px]">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardStats({ users, generations, requests, hardware }: any) {
  const stats = [
    { label: 'Total Users', value: users.length, icon: Users, color: 'text-neon-blue', bg: 'bg-neon-blue/10' },
    { label: 'Total Generations', value: generations.length, icon: ImageIcon, color: 'text-neon-purple', bg: 'bg-neon-purple/10' },
    { label: 'Active Requests', value: requests.length, icon: Activity, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { label: 'RAM Usage', value: hardware ? `${hardware.memory?.usedGB} GB / ${hardware.memory?.totalGB} GB` : '...', icon: HardDrive, color: 'text-neon-blue', bg: 'bg-neon-blue/10' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12" role="list" aria-label="System statistics overview">
      {stats.map((stat) => (
        <div key={stat.label} className="glass p-6 rounded-3xl border border-white/10 flex items-center gap-4" role="listitem">
          <div className={`w-12 h-12 ${stat.bg} rounded-2xl flex items-center justify-center border border-white/5`}>
            <stat.icon className={`w-6 h-6 ${stat.color}`} aria-hidden="true" />
          </div>
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">{stat.label}</p>
            <p className="text-2xl font-display font-bold text-white">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemSettings({ maintenanceMode, isEnhanceGlobal, isTxtToImgGlobal, isImgToImgGlobal, userLimit, onUpdateSettings }: any) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Maintenance Mode */}
      <div className="glass p-8 rounded-[2rem] border border-white/10 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Activity className="w-5 h-5 text-neon-blue" />
          <h3 className="text-xl font-bold text-white">System Status</h3>
        </div>
        
        <div className="space-y-4">
          {[
            { label: 'Operational', value: 0, desc: 'All systems go. Normal operation.' },
            { label: 'Maintenance', value: 1, desc: 'Full lockdown. Generation disabled.' },
            { label: 'Soft Maintenance', value: 2, desc: 'Warnings active but systems open.' }
          ].map((mode) => (
            <button
              key={mode.value}
              onClick={() => onUpdateSettings({ maintenanceMode: mode.value })}
              className={`w-full p-4 rounded-2xl border transition-all text-left group ${
                maintenanceMode === mode.value 
                  ? 'bg-neon-blue/10 border-neon-blue/50 shadow-[0_0_20px_rgba(0,255,255,0.1)]' 
                  : 'bg-white/5 border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-bold ${maintenanceMode === mode.value ? 'text-neon-blue' : 'text-white/70'}`}>{mode.label}</span>
                {maintenanceMode === mode.value && <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse" />}
              </div>
              <p className="text-[10px] text-white/40 leading-relaxed">{mode.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Feature Toggles */}
      <div className="glass p-8 rounded-[2rem] border border-white/10 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-5 h-5 text-neon-purple" />
          <h3 className="text-xl font-bold text-white">Feature Governance</h3>
        </div>

        <div className="space-y-4">
          {[
            { label: 'Bol-AI Enhance', key: 'isEnhanceGlobal', current: isEnhanceGlobal },
            { label: 'Text-to-Image', key: 'isTxtToImgGlobal', current: isTxtToImgGlobal },
            { label: 'Image-to-Image', key: 'isImgToImgGlobal', current: isImgToImgGlobal }
          ].map((feature) => (
            <div key={feature.key} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
              <div>
                <p className="text-sm font-bold text-white">{feature.label}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest">{feature.current ? 'Active' : 'Disabled'}</p>
              </div>
              <button 
                onClick={() => onUpdateSettings({ [feature.key]: !feature.current })}
                className={`p-2 rounded-xl transition-all ${feature.current ? 'text-neon-blue bg-neon-blue/10' : 'text-white/20 bg-white/5'}`}
              >
                {feature.current ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* User Limits */}
      <div className="glass p-8 rounded-[2rem] border border-white/10 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <UserCircle className="w-5 h-5 text-neon-blue" />
          <h3 className="text-xl font-bold text-white">User Limits</h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
            <p className="text-sm font-bold text-white mb-2">Daily Generation Limit</p>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                value={userLimit}
                onChange={(e) => onUpdateSettings({ userLimit: parseInt(e.target.value) || 1 })}
                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white w-24 outline-none focus:border-neon-blue transition-colors"
              />
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Generations per user per day</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserManagement({ users }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredUsers = users.filter((u: any) => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.uid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="glass rounded-[2rem] border border-white/10 overflow-hidden">
      <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white">User Directory</h3>
          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Manage and monitor user activity</p>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input 
            type="text" 
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-2 text-sm text-white outline-none focus:border-neon-blue transition-colors w-full md:w-64"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="User directory">
          <thead>
            <tr className="bg-white/5">
              <th scope="col" className="px-8 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">User</th>
              <th scope="col" className="px-8 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">UID</th>
              <th scope="col" className="px-8 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">Generations</th>
              <th scope="col" className="px-8 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">Last Login</th>
              <th scope="col" className="px-8 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredUsers.map((u: any) => (
              <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neon-blue/20 border border-neon-blue/30 flex items-center justify-center overflow-hidden">
                      {u.photoURL ? <img src={u.photoURL} alt={`${u.displayName || 'User'}'s avatar`} className="w-full h-full object-cover" /> : <UserCircle className="w-4 h-4 text-neon-blue" aria-hidden="true" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{u.displayName || 'Guest'}</p>
                      <p className="text-[10px] text-white/40">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-4 font-mono text-[10px] text-white/40">{u.uid}</td>
                <td className="px-8 py-4">
                  <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-white">
                    {u.generationsCount || 0}
                  </span>
                </td>
                <td className="px-8 py-4 text-[10px] text-white/40">
                  {u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : 'Never'}
                </td>
                <td className="px-8 py-4">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${u.role === 'admin' ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                    {u.role || 'user'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GalleryManagement({ generations, onDelete }: any) {
  return (
    <div className="glass rounded-[2rem] border border-white/10 overflow-hidden">
      <div className="p-8 border-b border-white/5">
        <h3 className="text-xl font-bold text-white">Global Gallery</h3>
        <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Monitor and moderate all generated content</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-8" role="list" aria-label="Global image gallery">
        {generations.map((gen: any) => (
          <div key={gen.id} className="group relative glass rounded-2xl border border-white/10 overflow-hidden aspect-square" role="listitem">
            <img src={gen.imageUrl} alt={`Generated image for prompt: ${gen.prompt}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
              <p className="text-[10px] text-white/80 line-clamp-2 mb-3">{gen.prompt}</p>
              <div className="flex items-center justify-between">
                <span className="text-[8px] text-white/40 uppercase tracking-widest">UID: {gen.userId?.slice(0, 8)}...</span>
                <button 
                  onClick={() => onDelete(gen.id)}
                  className="p-2 bg-red-500/20 text-red-500 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={`Delete image for prompt: ${gen.prompt}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExamplesManagement({ examples, onAdd, onDelete }: any) {
  const [newUrl, setNewUrl] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  return (
    <div className="glass rounded-[2rem] border border-white/10 overflow-hidden">
      <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white">Example Showcase</h3>
          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Manage images displayed on the home page</p>
        </div>
      </div>
      
      <div className="p-8 border-b border-white/5 bg-white/5">
        <h4 className="text-xs font-bold text-white mb-4 uppercase tracking-widest">Add New Example</h4>
        <div className="flex flex-col md:flex-row gap-4">
          <input 
            type="text" 
            placeholder="Image URL"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-neon-blue transition-colors"
          />
          <input 
            type="text" 
            placeholder="Prompt"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-neon-blue transition-colors"
          />
          <button 
            onClick={() => {
              if (newUrl && newPrompt) {
                onAdd(newUrl, newPrompt);
                setNewUrl('');
                setNewPrompt('');
              }
            }}
            className="px-6 py-2 bg-neon-blue text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 p-8" role="list" aria-label="Example showcase images">
        {examples.map((ex: any) => (
          <div key={ex.id} className="group relative glass rounded-2xl border border-white/10 overflow-hidden aspect-square" role="listitem">
            <img src={ex.imageUrl} alt={`Example image for prompt: ${ex.prompt}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
              <button 
                onClick={() => onDelete(ex.id)}
                className="p-3 bg-red-500/20 text-red-500 rounded-xl border border-red-500/30 hover:bg-red-500 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label={`Delete example image for prompt: ${ex.prompt}`}
              >
                <Trash2 className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

class AdminErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AdminErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/50 rounded-2xl p-8 max-w-md w-full text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-zinc-400 mb-6">
              {(this as any).state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

function AdminApp() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Settings State
  const [maintenanceMode, setMaintenanceMode] = useState(0);
  const [isEnhanceGlobal, setIsEnhanceGlobal] = useState(true);
  const [isTxtToImgGlobal, setIsTxtToImgGlobal] = useState(true);
  const [isImgToImgGlobal, setIsImgToImgGlobal] = useState(true);
  const [userLimit, setUserLimit] = useState(10);
  
  // Data State
  const [users, setUsers] = useState<any[]>([]);
  const [generations, setGenerations] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [examples, setExamples] = useState<any[]>([]);
  const [hardware, setHardware] = useState<any>(null);
  
  const [showToast, setShowToast] = useState<string | null>(null);

  useEffect(() => {
    const fetchHardware = async () => {
      try {
        const res = await fetch('/api/hardware');
        const data = await res.json();
        setHardware(data);
      } catch (e) {
        console.error("Failed to fetch hardware stats", e);
      }
    };
    fetchHardware();
    const interval = setInterval(fetchHardware, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        const isAdminUser = userData?.role === 'admin' || user.email === 'vivekdalvi147@gmail.com' || user.uid === '2cwK3E4SSvezZRop3VE14lbfJdc2';
        setIsAdmin(isAdminUser);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    if (!isAdmin) return;

    // Listen to Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setMaintenanceMode(data.maintenanceMode ?? 0);
        setIsEnhanceGlobal(data.isEnhanceGlobal ?? true);
        setIsTxtToImgGlobal(data.isTxtToImgGlobal ?? true);
        setIsImgToImgGlobal(data.isImgToImgGlobal ?? true);
        setUserLimit(data.userLimit ?? 10);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/general');
      setShowToast("Permission Denied: Could not fetch settings. Please deploy Firestore rules.");
      setTimeout(() => setShowToast(null), 5000);
    });

    // Listen to Users
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('lastLogin', 'desc')), (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setShowToast("Permission Denied: Could not fetch users. Please deploy Firestore rules.");
      setTimeout(() => setShowToast(null), 5000);
    });

    // Listen to Generations
    const unsubGens = onSnapshot(query(collection(db, 'generations'), orderBy('createdAt', 'desc'), limit(50)), (snap) => {
      setGenerations(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'generations');
    });

    // Listen to Requests (Active)
    const unsubReqs = onSnapshot(query(collection(db, 'requests'), where('status', '==', 'active')), (snap) => {
      setRequests(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
    });

    // Listen to Examples
    const unsubExamples = onSnapshot(query(collection(db, 'examples'), orderBy('createdAt', 'desc')), (snap) => {
      setExamples(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'examples');
    });

    return () => {
      unsubSettings();
      unsubUsers();
      unsubGens();
      unsubReqs();
      unsubExamples();
    };
  }, [isAdmin]);

  const handleUpdateSettings = async (newSettings: any) => {
    try {
      await setDoc(doc(db, 'settings', 'general'), newSettings, { merge: true });
      setShowToast("Settings updated successfully!");
      setTimeout(() => setShowToast(null), 3000);
    } catch (e) {
      console.error("Failed to update settings:", e);
      setShowToast("Failed to update settings.");
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteGeneration = async (id: string) => {
    if (!confirm("Delete this generation permanently?")) return;
    try {
      await deleteDoc(doc(db, 'generations', id));
      setShowToast("Generation deleted.");
      setTimeout(() => setShowToast(null), 3000);
    } catch (e) {
      setShowToast("Failed to delete.");
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleAddExample = async (imageUrl: string, prompt: string) => {
    try {
      await addDoc(collection(db, 'examples'), {
        imageUrl,
        prompt,
        createdAt: serverTimestamp()
      });
      setShowToast("Example added successfully!");
      setTimeout(() => setShowToast(null), 3000);
    } catch (e) {
      setShowToast("Failed to add example.");
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteExample = async (id: string) => {
    if (!confirm("Delete this example?")) return;
    try {
      await deleteDoc(doc(db, 'examples', id));
      setShowToast("Example removed.");
      setTimeout(() => setShowToast(null), 3000);
    } catch (e) {
      setShowToast("Failed to remove.");
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm("Force delete this active request?")) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      setShowToast("Request deleted.");
      setTimeout(() => setShowToast(null), 3000);
    } catch (e) {
      setShowToast("Failed to delete request.");
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-neon-blue animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center border border-red-500/20 mb-8">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-3xl font-display font-bold text-white mb-4 text-center">Access Restricted</h1>
        <p className="text-white/40 text-center max-w-md mb-8">
          This sector is reserved for system administrators. Unauthorized access attempts are logged.
        </p>
        <button 
          onClick={() => window.location.href = '/'}
          className="px-8 py-3 bg-white/5 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/10 transition-all"
        >
          Return to Base
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-neon-blue/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.location.href = '/'}>
            <div className="w-10 h-10 bg-gradient-to-br from-neon-blue to-neon-purple rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,255,255,0.3)] group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-display font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">Bol-AI</span>
          </div>
          
          <div className="hidden md:flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'gallery', label: 'Gallery', icon: ImageIcon },
              { id: 'examples', label: 'Examples', icon: Sparkles },
              { id: 'hardware', label: 'Hardware', icon: Server },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === tab.id 
                    ? 'bg-neon-blue text-black shadow-[0_0_20px_rgba(0,255,255,0.3)]' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <button 
            onClick={() => signOut(auth).then(() => window.location.href = '/')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Logout</span>
          </button>
        </div>
      </nav>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 z-50 glass rounded-2xl border border-white/10 p-2 flex items-center justify-around">
        {[
          { id: 'dashboard', icon: LayoutDashboard },
          { id: 'settings', icon: SettingsIcon },
          { id: 'users', icon: Users },
          { id: 'gallery', icon: ImageIcon },
          { id: 'examples', icon: Sparkles },
          { id: 'hardware', icon: Server },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`p-3 rounded-xl transition-all ${
              activeTab === tab.id ? 'bg-neon-blue text-black' : 'text-white/40'
            }`}
          >
            <tab.icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      <main className="pt-32 pb-24 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="flex items-center gap-4 mb-12">
                <div className="w-16 h-16 bg-neon-blue/20 rounded-2xl flex items-center justify-center border border-neon-blue/30 shadow-[0_0_30px_rgba(0,255,255,0.2)]">
                  <LayoutDashboard className="w-8 h-8 text-neon-blue" />
                </div>
                <div>
                  <h2 className="text-4xl font-display font-bold text-white">Command Center</h2>
                  <p className="text-neon-blue font-bold tracking-widest uppercase text-[10px] mt-1">Real-time System Overview</p>
                </div>
              </div>
              <DashboardStats users={users} generations={generations} requests={requests} hardware={hardware} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass p-8 rounded-[2rem] border border-white/10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-white">Recent Activity</h3>
                    <RefreshCw className="w-4 h-4 text-white/20 animate-spin-slow" />
                  </div>
                  <div className="space-y-4" role="list" aria-label="Recent system activity">
                    {generations.slice(0, 5).map((gen) => (
                      <div key={gen.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5" role="listitem">
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10">
                          <img src={gen.imageUrl} alt={`Generated image for prompt: ${gen.prompt}`} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{gen.prompt}</p>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">
                            {gen.createdAt?.toDate ? gen.createdAt.toDate().toLocaleTimeString() : 'Just now'}
                          </p>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="glass p-8 rounded-[2rem] border border-white/10">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-white">Active Requests</h3>
                    <span className="px-2 py-1 rounded-lg bg-yellow-500/20 text-yellow-500 text-[10px] font-bold uppercase tracking-widest border border-yellow-500/30">
                      {requests.length} Processing
                    </span>
                  </div>
                  <div className="space-y-4" role="list" aria-label="Active generation requests">
                    {requests.length === 0 ? (
                      <div className="text-center py-12">
                        <Clock className="w-12 h-12 text-white/10 mx-auto mb-4" aria-hidden="true" />
                        <p className="text-white/40 text-sm">No active requests at the moment</p>
                      </div>
                    ) : (
                      requests.map((req) => (
                        <div key={req.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4" role="listitem">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                              <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" aria-hidden="true" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{req.prompt}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1 text-[8px] text-white/40 uppercase tracking-widest">
                                  <Mail className="w-2 h-2" aria-hidden="true" /> {req.userEmail || 'Unknown'}
                                </span>
                                <span className="flex items-center gap-1 text-[8px] text-white/40 uppercase tracking-widest">
                                  <Globe className="w-2 h-2" aria-hidden="true" /> {req.userIp || 'Unknown'}
                                </span>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleDeleteRequest(req.id)}
                              className="p-2 bg-red-500/10 text-red-500 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
                              aria-label={`Delete request for prompt: ${req.prompt}`}
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                          
                          {req.enhancedPrompt && (
                            <div className="p-3 rounded-xl bg-neon-blue/5 border border-neon-blue/10">
                              <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-3 h-3 text-neon-blue" />
                                <span className="text-[8px] font-bold text-neon-blue uppercase tracking-widest">Enhanced Prompt</span>
                              </div>
                              <p className="text-[10px] text-white/60 italic leading-relaxed">{req.enhancedPrompt}</p>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${req.isEnhance ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                              {req.isEnhance ? 'Bol-AI Enhanced' : 'Standard'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10 text-[8px] font-bold uppercase tracking-widest">
                              {req.type || 'txt2img'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="flex items-center gap-4 mb-12">
                <div className="w-16 h-16 bg-neon-purple/20 rounded-2xl flex items-center justify-center border border-neon-purple/30 shadow-[0_0_30px_rgba(176,38,255,0.2)]">
                  <SettingsIcon className="w-8 h-8 text-neon-purple" />
                </div>
                <div>
                  <h2 className="text-4xl font-display font-bold text-white">System Settings</h2>
                  <p className="text-neon-purple font-bold tracking-widest uppercase text-[10px] mt-1">Global Configuration</p>
                </div>
              </div>
              <SystemSettings 
                maintenanceMode={maintenanceMode}
                isEnhanceGlobal={isEnhanceGlobal}
                isTxtToImgGlobal={isTxtToImgGlobal}
                isImgToImgGlobal={isImgToImgGlobal}
                userLimit={userLimit}
                onUpdateSettings={handleUpdateSettings}
              />
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div key="users" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="flex items-center gap-4 mb-12">
                <div className="w-16 h-16 bg-neon-blue/20 rounded-2xl flex items-center justify-center border border-neon-blue/30 shadow-[0_0_30px_rgba(0,255,255,0.2)]">
                  <Users className="w-8 h-8 text-neon-blue" />
                </div>
                <div>
                  <h2 className="text-4xl font-display font-bold text-white">User Management</h2>
                  <p className="text-neon-blue font-bold tracking-widest uppercase text-[10px] mt-1">Governance & Access Control</p>
                </div>
              </div>
              <UserManagement users={users} />
            </motion.div>
          )}

          {activeTab === 'gallery' && (
            <motion.div key="gallery" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="flex items-center gap-4 mb-12">
                <div className="w-16 h-16 bg-neon-purple/20 rounded-2xl flex items-center justify-center border border-neon-purple/30 shadow-[0_0_30px_rgba(176,38,255,0.2)]">
                  <ImageIcon className="w-8 h-8 text-neon-purple" />
                </div>
                <div>
                  <h2 className="text-4xl font-display font-bold text-white">Master Gallery</h2>
                  <p className="text-neon-purple font-bold tracking-widest uppercase text-[10px] mt-1">Content Moderation</p>
                </div>
              </div>
              <GalleryManagement generations={generations} onDelete={handleDeleteGeneration} />
            </motion.div>
          )}

          {activeTab === 'examples' && (
            <motion.div key="examples" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="flex items-center gap-4 mb-12">
                <div className="w-16 h-16 bg-neon-blue/20 rounded-2xl flex items-center justify-center border border-neon-blue/30 shadow-[0_0_30px_rgba(0,255,255,0.2)]">
                  <Sparkles className="w-8 h-8 text-neon-blue" />
                </div>
                <div>
                  <h2 className="text-4xl font-display font-bold text-white">Showcase Management</h2>
                  <p className="text-neon-blue font-bold tracking-widest uppercase text-[10px] mt-1">Curate Home Page Content</p>
                </div>
              </div>
              <ExamplesManagement examples={examples} onAdd={handleAddExample} onDelete={handleDeleteExample} />
            </motion.div>
          )}

          {activeTab === 'hardware' && (
            <motion.div key="hardware" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="flex items-center gap-4 mb-12">
                <div className="w-16 h-16 bg-neon-blue/20 rounded-2xl flex items-center justify-center border border-neon-blue/30 shadow-[0_0_30px_rgba(0,255,255,0.2)]">
                  <Server className="w-8 h-8 text-neon-blue" />
                </div>
                <div>
                  <h2 className="text-4xl font-display font-bold text-white">Hardware Monitor</h2>
                  <p className="text-neon-blue font-bold tracking-widest uppercase text-[10px] mt-1">Infrastructure Health</p>
                </div>
              </div>
              <HardwareStats stats={hardware} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className="glass px-6 py-3 rounded-2xl border border-neon-blue/30 flex items-center gap-3 shadow-[0_0_30px_rgba(0,255,255,0.2)]">
              <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse" />
              <span className="text-sm font-bold text-white tracking-wide">{showToast}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <AdminErrorBoundary>
      <AdminApp />
    </AdminErrorBoundary>
  );
}
