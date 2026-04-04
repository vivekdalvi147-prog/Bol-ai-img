import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trash2, Plus, Save, X, MessageSquare, Database, Settings, User, Clock, Bot } from 'lucide-react';

interface AIModel {
  id?: string;
  name: string;
  endpoint: string;
  systemInstruction: string;
  extraKnowledge: string;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsFile: boolean;
}

interface ChatHistory {
  id: string;
  userId: string;
  userEmail: string;
  prompt: string;
  response: string;
  model: string;
  createdAt: any;
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'models' | 'chats' | 'requests'>('models');
  const [models, setModels] = useState<AIModel[]>([]);
  const [chats, setChats] = useState<ChatHistory[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newModel, setNewModel] = useState<AIModel>({
    name: '',
    endpoint: '/api/chat',
    systemInstruction: '',
    extraKnowledge: '',
    supportsImage: false,
    supportsVideo: false,
    supportsFile: false
  });

  useEffect(() => {
    fetchModels();
    fetchChats();
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      setRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("[Bol-AI] Error fetching requests:", error);
      handleFirestoreError(error, OperationType.LIST, 'requests');
    }
  };

  const fetchModels = async () => {
    try {
      const q = query(collection(db, 'ai_models'));
      const snapshot = await getDocs(q);
      setModels(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AIModel)));
    } catch (error) {
      console.error("[Bol-AI] Error fetching models:", error);
      handleFirestoreError(error, OperationType.LIST, 'ai_models');
    }
  };

  const fetchChats = async () => {
    try {
      const q = query(collection(db, 'chat_history'), orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      setChats(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatHistory)));
    } catch (error) {
      console.error("[Bol-AI] Error fetching chats:", error);
      handleFirestoreError(error, OperationType.LIST, 'chat_history');
    }
  };

  const handleSaveModel = async () => {
    if (!newModel.name || !newModel.endpoint) return;
    try {
      await addDoc(collection(db, 'ai_models'), newModel);
      setIsAdding(false);
      setNewModel({
        name: '',
        endpoint: '/api/chat',
        systemInstruction: '',
        extraKnowledge: '',
        supportsImage: false,
        supportsVideo: false,
        supportsFile: false
      });
      fetchModels();
    } catch (error) {
      console.error("[Bol-AI] Error saving model:", error);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!window.confirm("Delete this model?")) return;
    try {
      await deleteDoc(doc(db, 'ai_models', id));
      fetchModels();
    } catch (error) {
      console.error("[Bol-AI] Error deleting model:", error);
    }
  };

  const handleDeleteChat = async (id: string) => {
    if (!window.confirm("Delete this chat record?")) return;
    try {
      await deleteDoc(doc(db, 'chat_history', id));
      fetchChats();
    } catch (error) {
      console.error("[Bol-AI] Error deleting chat:", error);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm("Delete this image request?")) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      fetchRequests();
    } catch (error) {
      console.error("[Bol-AI] Error deleting request:", error);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto text-white pb-32">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-neon-blue uppercase italic">Admin <span className="text-white">Control</span></h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-bold">Bol-AI Central Intelligence Unit</p>
        </div>
        
        <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5 backdrop-blur-xl flex-wrap gap-2">
          <button 
            onClick={() => setActiveTab('models')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'models' ? 'bg-neon-blue text-black shadow-[0_0_20px_rgba(0,240,255,0.3)]' : 'text-white/40 hover:text-white'}`}
          >
            <Settings className="w-4 h-4" /> Models
          </button>
          <button 
            onClick={() => setActiveTab('chats')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'chats' ? 'bg-neon-purple text-white shadow-[0_0_20px_rgba(176,38,255,0.3)]' : 'text-white/40 hover:text-white'}`}
          >
            <MessageSquare className="w-4 h-4" /> Chat History
          </button>
          <button 
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'requests' ? 'bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'text-white/40 hover:text-white'}`}
          >
            <Database className="w-4 h-4" /> Image Requests
          </button>
        </div>
      </div>

      {activeTab === 'models' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Database className="w-5 h-5 text-neon-blue" /> AI Models Configuration
            </h2>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-neon-blue/10 border border-neon-blue/30 text-neon-blue hover:bg-neon-blue hover:text-black px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Model
            </button>
          </div>

          {isAdding && (
            <div className="glass p-6 rounded-3xl border-neon-blue/20 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">Configure New Model</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Model Name</label>
                  <input 
                    type="text" 
                    value={newModel.name} 
                    onChange={e => setNewModel({...newModel, name: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm focus:border-neon-blue outline-none transition-all"
                    placeholder="e.g., Bol-AI Pro"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">API Endpoint</label>
                  <input 
                    type="text" 
                    value={newModel.endpoint} 
                    onChange={e => setNewModel({...newModel, endpoint: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm focus:border-neon-blue outline-none transition-all"
                    placeholder="/api/chat"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-white/40 ml-1">System Instruction</label>
                <textarea 
                  value={newModel.systemInstruction} 
                  onChange={e => setNewModel({...newModel, systemInstruction: e.target.value})}
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm h-32 focus:border-neon-blue outline-none transition-all resize-none"
                  placeholder="You are Bol-AI..."
                />
              </div>

              <div className="flex flex-wrap gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={newModel.supportsImage} onChange={e => setNewModel({...newModel, supportsImage: e.target.checked})} className="w-4 h-4 rounded border-white/20 bg-black text-neon-blue focus:ring-neon-blue" />
                  <span className="text-xs font-bold text-white/60 group-hover:text-white">Images</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={newModel.supportsVideo} onChange={e => setNewModel({...newModel, supportsVideo: e.target.checked})} className="w-4 h-4 rounded border-white/20 bg-black text-neon-blue focus:ring-neon-blue" />
                  <span className="text-xs font-bold text-white/60 group-hover:text-white">Video</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={newModel.supportsFile} onChange={e => setNewModel({...newModel, supportsFile: e.target.checked})} className="w-4 h-4 rounded border-white/20 bg-black text-neon-blue focus:ring-neon-blue" />
                  <span className="text-xs font-bold text-white/60 group-hover:text-white">Files</span>
                </label>
              </div>

              <button 
                onClick={handleSaveModel}
                className="w-full bg-neon-blue text-black py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.01] active:scale-95 transition-all shadow-[0_0_30px_rgba(0,240,255,0.3)]"
              >
                Deploy Model
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {models.map(model => (
              <div key={model.id} className="glass p-6 rounded-3xl border-white/5 hover:border-neon-blue/30 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => model.id && handleDeleteModel(model.id)}
                    className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 rounded-lg hover:text-white transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <h3 className="font-black text-xl text-neon-blue mb-1 uppercase italic tracking-tight">{model.name}</h3>
                <p className="text-xs text-white/40 font-mono mb-4">{model.endpoint}</p>
                
                <div className="flex gap-2">
                  {model.supportsImage && <span className="bg-neon-blue/10 text-neon-blue px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-neon-blue/20">Images</span>}
                  {model.supportsVideo && <span className="bg-neon-purple/10 text-neon-purple px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-neon-purple/20">Video</span>}
                  {model.supportsFile && <span className="bg-cyan-500/10 text-cyan-500 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-cyan-500/20">Files</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'chats' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-neon-purple" /> Real-time Chat Logs
            </h2>
            <button 
              onClick={fetchChats}
              className="p-2 hover:bg-white/5 rounded-xl transition-all"
              title="Refresh Logs"
            >
              <Clock className="w-5 h-5 text-white/40" />
            </button>
          </div>

          <div className="space-y-4">
            {chats.length === 0 ? (
              <div className="glass p-12 rounded-3xl text-center border-white/5">
                <p className="text-white/30 font-bold uppercase tracking-widest text-sm">No chat history found</p>
              </div>
            ) : (
              chats.map(chat => (
                <div key={chat.id} className="glass p-6 rounded-3xl border-white/5 hover:border-neon-purple/30 transition-all space-y-4 relative group">
                  <button 
                    onClick={() => handleDeleteChat(chat.id)}
                    className="absolute top-6 right-6 p-2 bg-red-500/10 text-red-500 hover:bg-red-500 rounded-lg hover:text-white transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                      <User className="w-3 h-3 text-neon-blue" /> {chat.userEmail}
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                      <Bot className="w-3 h-3 text-neon-purple" /> {chat.model}
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                      <Clock className="w-3 h-3" /> {chat.createdAt?.toDate?.()?.toLocaleString() || 'Recent'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase font-black text-neon-blue tracking-widest">User Prompt</p>
                      <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-sm leading-relaxed text-white/80">
                        {chat.prompt}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase font-black text-neon-purple tracking-widest">AI Response</p>
                      <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-sm leading-relaxed text-white/80 max-h-48 overflow-y-auto custom-scrollbar">
                        {chat.response}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-500" /> Image Generation Requests
            </h2>
            <button 
              onClick={fetchRequests}
              className="p-2 hover:bg-white/5 rounded-xl transition-all"
              title="Refresh Logs"
            >
              <Clock className="w-5 h-5 text-white/40" />
            </button>
          </div>

          <div className="space-y-4">
            {requests.length === 0 ? (
              <div className="glass p-12 rounded-3xl text-center border-white/5">
                <p className="text-white/30 font-bold uppercase tracking-widest text-sm">No image requests found</p>
              </div>
            ) : (
              requests.map(req => (
                <div key={req.id} className="glass p-6 rounded-3xl border-white/5 hover:border-cyan-500/30 transition-all space-y-4 relative group">
                  <button 
                    onClick={() => handleDeleteRequest(req.id)}
                    className="absolute top-6 right-6 p-2 bg-red-500/10 text-red-500 hover:bg-red-500 rounded-lg hover:text-white transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                      <User className="w-3 h-3 text-cyan-500" /> {req.userEmail || 'Anonymous'}
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                      <Clock className="w-3 h-3" /> {req.createdAt?.toDate?.()?.toLocaleString() || 'Recent'}
                    </div>
                    {req.size && (
                      <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                        Size: {req.size}
                      </div>
                    )}
                    {req.quality && (
                      <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                        Quality: {req.quality}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase font-black text-cyan-500 tracking-widest">Original Prompt</p>
                      <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-sm leading-relaxed text-white/80">
                        {req.prompt}
                      </div>
                    </div>
                    {req.enhancedPrompt && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-black text-neon-purple tracking-widest">Enhanced Prompt</p>
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-sm leading-relaxed text-white/80 max-h-48 overflow-y-auto custom-scrollbar">
                          {req.enhancedPrompt}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
