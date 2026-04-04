import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trash2, Plus, Save, X } from 'lucide-react';

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

export default function AdminPanel() {
  const [models, setModels] = useState<AIModel[]>([]);
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
  }, []);

  const fetchModels = async () => {
    try {
      const q = query(collection(db, 'ai_models'));
      const snapshot = await getDocs(q);
      setModels(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AIModel)));
    } catch (error) {
      console.error("[Bol-AI] Error fetching models:", error);
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
      alert("Failed to save model. Check permissions.");
    }
  };

  const handleDeleteModel = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ai_models', id));
      fetchModels();
    } catch (error) {
      console.error("[Bol-AI] Error deleting model:", error);
      alert("Failed to delete model. Check permissions.");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-8 text-neon-blue">Admin Panel - AI Models</h1>
      
      <div className="mb-8">
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-neon-blue text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Add New Model
        </button>
      </div>

      {isAdding && (
        <div className="glass p-6 rounded-2xl mb-8 space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Add New AI Model</h2>
            <button onClick={() => setIsAdding(false)} className="text-white/50 hover:text-white"><X /></button>
          </div>
          
          <div>
            <label className="block text-sm mb-1 text-white/70">Model Name</label>
            <input 
              type="text" 
              value={newModel.name} 
              onChange={e => setNewModel({...newModel, name: e.target.value})}
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white"
              placeholder="e.g., Gemini 1.5 Pro"
            />
          </div>
          
          <div>
            <label className="block text-sm mb-1 text-white/70">API Endpoint</label>
            <input 
              type="text" 
              value={newModel.endpoint} 
              onChange={e => setNewModel({...newModel, endpoint: e.target.value})}
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white"
              placeholder="e.g., /api/chat"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-white/70">System Instruction</label>
            <textarea 
              value={newModel.systemInstruction} 
              onChange={e => setNewModel({...newModel, systemInstruction: e.target.value})}
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white h-32"
              placeholder="You are a helpful assistant..."
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-white/70">Extra Knowledge</label>
            <textarea 
              value={newModel.extraKnowledge} 
              onChange={e => setNewModel({...newModel, extraKnowledge: e.target.value})}
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white h-24"
              placeholder="Additional context or data..."
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={newModel.supportsImage}
                onChange={e => setNewModel({...newModel, supportsImage: e.target.checked})}
              />
              Supports Image
            </label>
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={newModel.supportsVideo}
                onChange={e => setNewModel({...newModel, supportsVideo: e.target.checked})}
              />
              Supports Video
            </label>
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={newModel.supportsFile}
                onChange={e => setNewModel({...newModel, supportsFile: e.target.checked})}
              />
              Supports File
            </label>
          </div>

          <button 
            onClick={handleSaveModel}
            className="bg-neon-purple text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 mt-4"
          >
            <Save className="w-5 h-5" /> Save Model
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {models.map(model => (
          <div key={model.id} className="glass p-4 rounded-xl flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg text-neon-blue">{model.name}</h3>
              <p className="text-sm text-white/50">{model.endpoint}</p>
              <div className="flex gap-2 mt-2 text-xs text-white/40">
                {model.supportsImage && <span className="bg-white/10 px-2 py-1 rounded">Image</span>}
                {model.supportsVideo && <span className="bg-white/10 px-2 py-1 rounded">Video</span>}
                {model.supportsFile && <span className="bg-white/10 px-2 py-1 rounded">File</span>}
              </div>
            </div>
            <button 
              onClick={() => model.id && handleDeleteModel(model.id)}
              className="text-red-500 hover:bg-red-500/20 p-2 rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
