import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, Sparkles, BrainCircuit, Image as ImageIcon, FileText, Video, Paperclip, X, Wand2, Copy, Check, Download, ExternalLink, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, onSnapshot, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  model?: string;
  timestamp: any;
  isTyping?: boolean;
  parts?: any[];
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

const CodeBlock = ({ language, value }: { language: string; value: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-${Date.now()}.${language || 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isPreviewable = language === 'html' || language === 'svg' || language === 'xml';

  return (
    <div className="relative group my-6 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0d1117]">
      <div className="flex items-center justify-between px-6 py-3 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/50" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-2">{language || 'code'}</span>
        </div>
        <div className="flex items-center gap-3">
          {isPreviewable && (
            <button 
              onClick={() => {
                const win = window.open();
                if (win) {
                  win.document.write(value);
                  win.document.close();
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-neon-blue/10 hover:bg-neon-blue/20 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest text-neon-blue border border-neon-blue/20"
            >
              <ExternalLink className="w-3 h-3" /> Preview
            </button>
          )}
          <button onClick={handleCopy} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-neon-blue" title="Copy Code">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={handleDownload} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-neon-purple" title="Download Code">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[500px] overflow-auto custom-scrollbar">
        <SyntaxHighlighter
          language={language || 'text'}
          style={atomDark}
          customStyle={{
            margin: 0,
            padding: '2rem',
            fontSize: '0.9rem',
            lineHeight: '1.7',
            background: 'transparent',
          }}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default function TextAI() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('bol_ai_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite-preview');
  const [selectedFile, setSelectedFile] = useState<{ data: string, mimeType: string, name: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default model
  const defaultModel: AIModel = {
    id: 'gemini-3.1-flash-lite-preview',
    name: 'Bol-AI (Lite)',
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
    localStorage.setItem('bol_ai_chat_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    // Load models from Firestore
    const q = query(collection(db, 'ai_models'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedModels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AIModel));
      setModels([defaultModel, ...loadedModels]);
    }, (error) => {
      console.error("[Bol-AI] Firestore Error (ai_models):", error);
      handleFirestoreError(error, OperationType.LIST, 'ai_models');
      setModels([defaultModel]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleToggleHistory = () => setShowHistory(prev => !prev);
    document.addEventListener('toggle-chat-history', handleToggleHistory);
    return () => document.removeEventListener('toggle-chat-history', handleToggleHistory);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File too large. Max 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      setSelectedFile({
        data: base64String,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSuggestedPrompt = (text: string) => {
    setInput(text);
  };

  const typeMessage = async (fullText: string, messageId: string) => {
    let currentText = '';
    const words = fullText.split(' ');
    
    for (let i = 0; i < words.length; i++) {
      currentText += (i === 0 ? '' : ' ') + words[i];
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, content: currentText, isTyping: i < words.length - 1 } : msg
      ));
      // Adjust speed based on word length
      await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedFile) || isLoading) return;

    const parts: any[] = [];
    if (selectedFile) {
      parts.push({
        inlineData: {
          data: selectedFile.data,
          mimeType: selectedFile.mimeType
        }
      });
    }
    if (input.trim()) {
      parts.push({ text: input });
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      parts: parts,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedFile(null);
    setIsLoading(true);

    try {
      const activeModel = models.find(m => m.id === selectedModel) || defaultModel;
      
      const response = await fetch(activeModel.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          parts: userMessage.parts,
          model: activeModel.id,
          systemInstruction: activeModel.systemInstruction,
          history: messages.slice(-10).map(m => ({ role: m.role, parts: m.parts || [{ text: m.content }] }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();
      
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        thinking: data.thinking,
        model: activeModel.name,
        timestamp: new Date(),
        isTyping: true
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false); // Stop loading spinner as we start typing

      await typeMessage(data.text, assistantMessageId);

      // Save to Firestore
      const user = auth.currentUser;
      try {
        await addDoc(collection(db, 'chat_history'), {
          userId: user ? user.uid : 'anonymous',
          userEmail: user ? user.email : 'anonymous@bol-ai.com',
          prompt: userMessage.content,
          hasFile: !!userMessage.parts?.find(p => p.inlineData),
          response: data.text,
          thinking: data.thinking,
          model: activeModel.name,
          createdAt: serverTimestamp()
        });
      } catch (fsError) {
        console.warn("[Bol-AI] Failed to save chat history to Firestore:", fsError);
        // We don't throw here to avoid breaking the chat experience for the user
        // but we log it for debugging
      }

    } catch (error: any) {
      console.error("Chat error:", error);
      
      let errorMessage = "Sorry, I encountered an error processing your request. Please try again.";
      
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = "Bol-AI is currently experiencing high demand (Quota Exceeded). Please wait a few seconds and try again.";
      } else if (error.message?.includes('API Key is missing')) {
        errorMessage = "API Key is missing. Please configure BOL_AI_API_KEY or GEMINI_API_KEY in AI Studio Secrets.";
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date()
      }]);
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    if (window.confirm("Are you sure you want to clear your chat history?")) {
      setMessages([]);
      localStorage.removeItem('bol_ai_chat_history');
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto pb-32">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 sm:gap-0 px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-neon-blue/10 rounded-xl text-neon-blue">
            <BrainCircuit className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">Bol-AI <span className="text-neon-blue">Chat</span></h2>
            <p className="text-[9px] sm:text-[10px] uppercase tracking-widest text-white/40 font-bold">Powered by Bol-AI Engine</p>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3">
          <button 
            onClick={clearHistory}
            className="p-2 hover:bg-red-500/10 rounded-xl text-white/40 hover:text-red-500 transition-all border border-transparent hover:border-red-500/20"
            title="Clear History"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 space-y-6 pr-2 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-2 sm:px-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-6xl"
            >
              <div className="text-left max-w-4xl mx-auto mt-8 sm:mt-16 px-4">
                <h3 className="text-[#00f0ff] text-3xl sm:text-4xl font-bold mb-6 flex items-center gap-3 sm:gap-4">
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10" /> bol-ai 1.0
                </h3>
                <p className="text-white/80 text-lg sm:text-xl leading-relaxed mb-8 sm:mb-10">
                  Welcome to <span className="font-bold text-neon-blue">Bol-AI</span>. I am your advanced intelligence partner, ready to solve complex problems, write code, or just chat.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {suggestedPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestedPrompt(prompt.text)}
                      className="flex items-center gap-4 sm:gap-5 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] bg-white/5 border border-white/5 hover:border-neon-blue/30 hover:bg-white/10 transition-all text-sm sm:text-base font-medium text-white/70 hover:text-white text-left group"
                    >
                      <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-black/40 group-hover:bg-neon-blue/20 transition-colors">
                        {prompt.icon}
                      </div>
                      {prompt.text}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          messages.map((msg) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[95%] md:max-w-[80%] rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 shadow-xl relative ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-neon-blue/20 to-cyan-600/10 border border-neon-blue/30 text-white' 
                  : 'glass border-white/10'
              }`}>
                <div className="flex items-center gap-2 mb-2 opacity-50 text-[9px] font-bold uppercase tracking-widest">
                  {msg.role === 'user' ? <User className="w-2.5 h-2.5" /> : <Bot className="w-2.5 h-2.5 text-neon-blue" />}
                  <span>{msg.role === 'user' ? 'You' : msg.model || 'Bol-AI'}</span>
                </div>

                {msg.parts?.map((part, idx) => {
                  if (part.inlineData) {
                    return (
                      <div key={idx} className="mb-4">
                        {part.inlineData.mimeType.startsWith('image/') ? (
                          <img 
                            src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`} 
                            alt="Attached" 
                            className="max-w-full h-auto rounded-xl border border-white/10"
                            style={{ maxHeight: '300px' }}
                          />
                        ) : (
                          <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10 text-sm">
                            <Paperclip className="w-4 h-4 text-neon-blue" />
                            <span className="truncate max-w-[200px]">Attached File</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
                
                {msg.thinking && (
                  <div className="mb-6 p-4 sm:p-5 bg-black/40 rounded-2xl border border-white/5 text-sm text-white/60 shadow-inner overflow-hidden">
                    <div className="flex items-center gap-2 mb-3 text-neon-purple font-bold text-[10px] uppercase tracking-widest">
                      <BrainCircuit className="w-4 h-4" /> Thinking Process
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed italic text-xs">{msg.thinking}</div>
                  </div>
                )}
                
                <div className="prose prose-xs prose-invert max-w-none prose-p:leading-snug prose-pre:p-0 prose-pre:bg-transparent prose-code:text-neon-blue prose-code:bg-neon-blue/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none text-xs sm:text-sm">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match;
                        return !isInline ? (
                          <CodeBlock
                            language={match[1]}
                            value={String(children).replace(/\n$/, '')}
                          />
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                
                {msg.isTyping && (
                  <div className="mt-4 flex gap-1">
                    <div className="w-1.5 h-1.5 bg-neon-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-neon-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-neon-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="glass rounded-[2rem] p-6 flex items-center gap-4 border-white/10 shadow-2xl">
              <div className="relative">
                <div className="absolute inset-0 bg-neon-blue blur-md opacity-50 animate-pulse" />
                <Loader2 className="w-6 h-6 animate-spin text-neon-blue relative z-10" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white/90">Bol-AI is thinking...</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Processing Neural Pathways</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black via-black/90 to-transparent pt-12">
        <form onSubmit={handleSubmit} className="relative group max-w-6xl mx-auto w-full pb-8 px-4">
          {selectedFile && (
            <div className="absolute -top-16 left-8 bg-black/80 border border-white/10 rounded-xl p-2 flex items-center gap-3 backdrop-blur-md">
              {selectedFile.mimeType.startsWith('image/') ? (
                <img src={`data:${selectedFile.mimeType};base64,${selectedFile.data}`} alt="preview" className="w-10 h-10 object-cover rounded-lg" />
              ) : (
                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center">
                  <Paperclip className="w-5 h-5 text-neon-blue" />
                </div>
              )}
              <div className="flex flex-col max-w-[150px]">
                <span className="text-xs font-bold truncate">{selectedFile.name}</span>
                <span className="text-[9px] text-white/40 uppercase">{selectedFile.mimeType.split('/')[1] || 'file'}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedFile(null)}
                className="p-1 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="relative bg-[#0a0c10] rounded-full p-1 sm:p-2 flex items-center gap-1 sm:gap-2 border border-white/10 shadow-2xl backdrop-blur-xl group-focus-within:border-neon-blue/50 transition-all duration-500">
            <div className="pl-3 sm:pl-4">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-neon-blue group-focus-within:animate-pulse" />
            </div>
            
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message Bol-AI..."
              className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 py-2.5 sm:py-4 px-1 sm:px-4 text-white placeholder-white/20 text-xs sm:text-base font-medium"
            />

            <div className="flex items-center gap-0.5 sm:gap-1 pr-1 shrink-0">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx"
              />
              <button 
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "image/*";
                    fileInputRef.current.click();
                  }
                }}
                className="p-2 sm:p-3 hover:bg-white/5 rounded-full transition-all text-white/40 hover:text-neon-blue"
                title="Attach Image"
              >
                <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = ".pdf,.txt,.doc,.docx";
                    fileInputRef.current.click();
                  }
                }}
                className="p-2 sm:p-3 hover:bg-white/5 rounded-full transition-all text-white/40 hover:text-cyan-400"
                title="Attach File"
              >
                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button 
                type="submit" 
                disabled={isLoading || (!input.trim() && !selectedFile)}
                className={`ml-1 p-2.5 sm:p-4 rounded-full transition-all active:scale-95 shadow-[0_0_20px_rgba(0,240,255,0.4)] flex items-center justify-center shrink-0 ${
                  (input.trim() || selectedFile) ? 'bg-neon-blue text-black' : 'bg-white/10 text-white/40'
                }`}
              >
                {isLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Send className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full sm:w-96 bg-[#050505] border-l border-white/10 z-[70] flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-neon-blue/10 rounded-xl text-neon-blue">
                    <Save className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold">Chat History</h2>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                {messages.filter(m => m.role === 'user').length === 0 ? (
                  <div className="text-center text-white/40 mt-10 text-sm">
                    No history found. Start chatting!
                  </div>
                ) : (
                  messages.filter(m => m.role === 'user').reverse().map((msg, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-neon-blue/30 transition-colors cursor-pointer" onClick={() => setShowHistory(false)}>
                      <p className="text-sm text-white/80 line-clamp-2">{msg.content || 'Attached File'}</p>
                      <p className="text-[10px] text-white/40 mt-2 uppercase tracking-widest">{new Date(msg.timestamp).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
