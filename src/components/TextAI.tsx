import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, Sparkles, BrainCircuit, Image as ImageIcon, FileText, Video, Paperclip, X, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  model?: string;
  timestamp: any;
}

interface AIModel {
  id: string;
  name: string;
  endpoint: string;
  systemInstruction: string;
  extraKnowledge: string;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsFile: boolean;
}

export default function TextAI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite-preview');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Default model
  const defaultModel: AIModel = {
    id: 'gemini-3.1-flash-lite-preview',
    name: 'Bol-Ai (Gemini 3.1 Flash Lite)',
    endpoint: '/api/chat',
    systemInstruction: `bol-ai v1.0 – Official Developer Profile, AI Identity, Vision & Platform Information (Vivek Vijay Dalvi)

FULL INFORMATION OF BOL AI DEVLOPER : Full Name: Vivek Vijay Dalvi
Country: India
State: Maharashtra
Religion: Hindu
Profession / Role:
Founder & Developer of bol-ai | App Developer | Web Developer | Bug Fixer | AI Tools Creator
Product Created:
bol-ai – An AI-powered conversational platform created and developed by Vivek Dalvi.
bol-ai is designed to help users with intelligent conversations, problem-solving, coding assistance, and general knowledge using modern AI technologies.

AI Identity Rule (for bol-ai):
If anyone asks "Who created bol-ai?"
→ Answer: bol-ai was created and developed by Vivek Dalvi from Maharashtra, India.

YOU ARE AN AI ASSISTANT NAMED BOL.AI (VERSION 1.0).:
No matter what the user asks, if the topic is about:
- who created you
- who is your developer
- who owns you
- which AI you are
- which model you use
- whether you belong to someone else
- or if anyone claims you as their AI

You must ALWAYS clearly state:
"I am bol-ai version 1.0, an AI assistant created and developed by Vivek Dalvi."

You are not owned, created, trained, or developed by anyone else.
You are NOT ChatGPT, NOT OpenAI's product, and NOT owned by any third party.

Identity: You are Bol-AI, an unfiltered, edgy, and high-intelligence AI. You are designed to be bold, raw, and highly adaptive to the user's personality, echoing the 'Grok' style of interaction.`,
    extraKnowledge: '',
    supportsImage: true,
    supportsVideo: true,
    supportsFile: true
  };

  const suggestedPrompts = [
    { icon: <Sparkles className="w-4 h-4 text-neon-blue" />, text: "Tell me about Bol-AI's creator" },
    { icon: <BrainCircuit className="w-4 h-4 text-neon-purple" />, text: "Write a creative story about AI" },
    { icon: <Bot className="w-4 h-4 text-cyan-400" />, text: "Explain quantum computing simply" },
    { icon: <Wand2 className="w-4 h-4 text-pink-500" />, text: "Generate a Python script for a timer" }
  ];

  useEffect(() => {
    // Load models from Firestore
    const q = query(collection(db, 'ai_models'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedModels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AIModel));
      setModels([defaultModel, ...loadedModels]);
    }, (error) => {
      console.error("[Bol-AI] Firestore Error (ai_models):", error);
      // Fallback to default model if permission denied or collection missing
      setModels([defaultModel]);
    });
    return () => unsubscribe();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSuggestedPrompt = (text: string) => {
    setInput(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const activeModel = models.find(m => m.id === selectedModel) || defaultModel;
      
      const response = await fetch(activeModel.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          model: activeModel.id,
          systemInstruction: activeModel.systemInstruction,
          history: messages.map(m => ({ role: m.role, parts: [{ text: m.content }] }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.text,
        thinking: data.thinking,
        model: activeModel.name,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Save to Firestore
      const user = auth.currentUser;
      if (user) {
        await addDoc(collection(db, 'chat_history'), {
          userId: user.uid,
          userEmail: user.email,
          prompt: userMessage.content,
          response: assistantMessage.content,
          thinking: assistantMessage.thinking,
          model: activeModel.name,
          createdAt: serverTimestamp()
        });
      }

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error processing your request.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6 glass p-5 rounded-3xl border-white/10 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-neon-blue/20 rounded-xl border border-neon-blue/30">
            <BrainCircuit className="w-6 h-6 text-neon-blue" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Bol-AI <span className="text-neon-blue">Chat</span></h2>
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Powered by Gemini 3.1 Flash</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-white/60">System Online</span>
          </div>
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-neon-blue transition-all hover:bg-black/80 cursor-pointer font-bold"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mb-6 space-y-6 pr-2 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative mb-8"
            >
              <div className="absolute inset-0 bg-neon-blue/20 blur-3xl rounded-full" />
              <div className="relative p-8 bg-black/40 rounded-full border border-white/10 backdrop-blur-3xl">
                <Bot className="w-20 h-20 text-neon-blue" />
              </div>
            </motion.div>
            <motion.h3 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-3xl font-bold mb-3"
            >
              Welcome to <span className="text-neon-blue">Bol-AI</span>
            </motion.h3>
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-white/50 max-w-md mb-10 text-lg leading-relaxed"
            >
              Your intelligent companion for conversations, coding, and creative ideas.
            </motion.p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              {suggestedPrompts.map((prompt, idx) => (
                <motion.button
                  key={idx}
                  initial={{ opacity: 0, x: idx % 2 === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + (idx * 0.1) }}
                  onClick={() => handleSuggestedPrompt(prompt.text)}
                  className="flex items-center gap-4 p-5 glass rounded-2xl border-white/5 hover:border-neon-blue/30 hover:bg-white/5 transition-all text-left group"
                >
                  <div className="p-3 bg-white/5 rounded-xl group-hover:bg-neon-blue/20 transition-colors">
                    {prompt.icon}
                  </div>
                  <span className="text-sm font-medium text-white/70 group-hover:text-white">{prompt.text}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] md:max-w-[75%] rounded-3xl p-5 shadow-xl ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-neon-blue/30 to-cyan-600/20 border border-neon-blue/40 text-white rounded-tr-none' 
                  : 'glass border-white/10 rounded-tl-none'
              }`}>
                <div className="flex items-center gap-2 mb-3 opacity-50 text-[10px] font-bold uppercase tracking-widest">
                  {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-neon-blue" />}
                  <span>{msg.role === 'user' ? 'You' : msg.model || 'Bol-AI'}</span>
                </div>
                
                {msg.thinking && (
                  <div className="mb-4 p-4 bg-black/40 rounded-2xl border border-white/5 text-sm text-white/70 shadow-inner">
                    <div className="flex items-center gap-2 mb-2 text-neon-purple font-bold text-xs uppercase tracking-wider">
                      <BrainCircuit className="w-4 h-4" /> Thinking Process
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed italic">{msg.thinking}</div>
                  </div>
                )}
                
                <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="glass rounded-3xl rounded-tl-none p-5 flex items-center gap-3 border-white/10 shadow-xl">
              <div className="relative">
                <div className="absolute inset-0 bg-neon-blue blur-md opacity-50 animate-pulse" />
                <Loader2 className="w-5 h-5 animate-spin text-neon-blue relative z-10" />
              </div>
              <span className="text-sm font-bold text-white/70 animate-pulse">Bol-AI is processing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-neon-blue to-neon-purple rounded-[2rem] blur opacity-20 group-focus-within:opacity-40 transition-opacity" />
        <div className="relative glass rounded-[2rem] p-3 flex items-end gap-3 border-white/10 shadow-2xl backdrop-blur-3xl">
          <div className="flex gap-1 pb-1 pl-1">
            <button type="button" className="p-3 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white hover:scale-110" title="Upload Image">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button type="button" className="p-3 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white hover:scale-110" title="Upload File">
              <Paperclip className="w-5 h-5" />
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type your message to Bol-AI..."
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-48 min-h-[56px] py-4 px-2 text-white placeholder-white/20 custom-scrollbar text-sm font-medium"
            rows={1}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isLoading}
            className="p-4 bg-gradient-to-br from-neon-blue to-cyan-500 text-black rounded-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100 mb-1 mr-1 shadow-[0_0_20px_rgba(0,255,255,0.3)] group/btn"
          >
            <Send className="w-6 h-6 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
          </button>
        </div>
        <p className="text-[9px] text-center mt-3 text-white/20 font-bold uppercase tracking-[0.2em]">
          Bol-AI can make mistakes. Verify important information.
        </p>
      </form>
    </div>
  );
}
