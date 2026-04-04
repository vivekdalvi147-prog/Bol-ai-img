/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Image as ImageIcon, Download, Send, Loader2, Info, LayoutGrid, ChevronLeft, ChevronRight, Maximize, Cpu, ChevronDown, Wand2, UserCircle, LogOut, X, Menu, Trash2, Share2, AlertTriangle, Zap, ShieldCheck, Mail, ImagePlus } from 'lucide-react';
import { auth, googleProvider, db } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, getDoc, orderBy, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import TextAI from './components/TextAI';
import AdminPanel from './components/AdminPanel';

// Add your example image URLs here! You can use local paths or full URLs.
const EXAMPLE_IMAGES = [
  'https://i.ibb.co/4ZS1YDxy/v.png',
  'https://i.ibb.co/zWKc7cR9/v2.png',
  'https://i.ibb.co/rRKWhbmj/v3.png',
  'https://i.ibb.co/PvjnRYBk/v4.png',
  'https://i.ibb.co/MkP4z7fG/v5.png',
  'https://i.ibb.co/B2mDVBQw/v7.png',
  'https://i.ibb.co/4ZP81Tr7/v11.png'
];

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [lastGeneratedId, setLastGeneratedId] = useState<string | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState(() => localStorage.getItem('bol_ai_size') || "1024*1024");
  const [quality, setQuality] = useState(() => localStorage.getItem('bol_ai_quality') || 'standard');
  const [isEnhanceEnabled, setIsEnhanceEnabled] = useState(() => localStorage.getItem('bol_ai_enhance') === 'false' ? false : true);
  const [generatedSize, setGeneratedSize] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveTooltip(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);
  const [isUiMode, setIsUiMode] = useState(() => localStorage.getItem('bol_ai_ui_mode') === 'true');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isLoginSliderOpen, setIsLoginSliderOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'generator' | 'gallery' | 'my-creations' | 'text-ai' | 'admin'>('generator');
  const [myImages, setMyImages] = useState<any[]>([]);
  const [sharedImage, setSharedImage] = useState<any>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(0); // 0: Off, 1: Full, 2: Soft
  const [isBolAiEnhanceGlobalEnabled, setIsBolAiEnhanceGlobalEnabled] = useState(true);
  const [userIp, setUserIp] = useState<string>('unknown');
  const [activePage, setActivePage] = useState<'home' | 'about' | 'privacy' | 'contact'>('home');
  const [exampleImages, setExampleImages] = useState<string[]>(EXAMPLE_IMAGES);
  const [generationsCount, setGenerationsCount] = useState(() => {
    const saved = localStorage.getItem('bol_ai_generations');
    return saved ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMaintenanceMode(data.maintenanceMode || 0);
        if (data.isBolAiEnhanceGlobalEnabled !== undefined) {
          setIsBolAiEnhanceGlobalEnabled(data.isBolAiEnhanceGlobalEnabled);
        }
      }
    }, (error) => {
      console.error("Error fetching settings:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchExamples = async () => {
      try {
        const q = query(collection(db, 'examples'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const fetchedExamples = snapshot.docs.map(d => d.data().imageUrl);
        setExampleImages([...EXAMPLE_IMAGES, ...fetchedExamples]);
      } catch (e: any) {
        console.warn("Could not fetch examples from Firestore (check rules). Using defaults.", e.message);
        setExampleImages([...EXAMPLE_IMAGES]);
      }
    };
    fetchExamples();
  }, []);

  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setUserIp(data.ip))
      .catch((e) => {
        console.warn("Could not fetch IP:", e.message);
        setUserIp('unknown');
      });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Track user login in Firestore for Admin Panel
        setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          displayName: currentUser.displayName || currentUser.providerData?.find(p => p.displayName)?.displayName || 'Guest',
          email: currentUser.email || currentUser.providerData?.find(p => p.email)?.email || 'N/A',
          photoURL: currentUser.photoURL || currentUser.providerData?.find(p => p.photoURL)?.photoURL || '',
          lastLogin: serverTimestamp()
        }, { merge: true }).catch(console.error);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (shareId) {
      getDoc(doc(db, 'generations', shareId)).then(docSnap => {
        if (docSnap.exists()) {
          setSharedImage({ id: docSnap.id, ...docSnap.data() });
        }
      }).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (user && activeTab === 'my-creations') {
      fetchMyImages();
    }
  }, [user, activeTab]);

  const fetchMyImages = async () => {
    if (!user) return;
    try {
      // Removed orderBy to avoid requiring a composite index in Firestore
      const q = query(collection(db, 'generations'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const images = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Sort client-side (newest first)
      images.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      setMyImages(images);
    } catch (e: any) {
      console.warn("Could not fetch my images from Firestore (check rules).", e.message);
    }
  };

  const [showToast, setShowToast] = useState<string | null>(null);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'generations', id));
      setMyImages(prev => prev.filter(img => img.id !== id));
      setShowToast("Image deleted successfully");
    } catch (e) {
      console.error("Failed to delete image:", e);
    }
  };

  const handleShare = (id: string) => {
    const url = `${window.location.origin}/?share=${id}`;
    navigator.clipboard.writeText(url);
    setShowToast("Link copied to clipboard!");
  };

  useEffect(() => {
    localStorage.setItem('bol_ai_generations', generationsCount.toString());
  }, [generationsCount]);

  useEffect(() => {
    localStorage.setItem('bol_ai_size', selectedSize);
  }, [selectedSize]);

  useEffect(() => {
    localStorage.setItem('bol_ai_quality', quality);
  }, [quality]);

  useEffect(() => {
    localStorage.setItem('bol_ai_enhance', isEnhanceEnabled.toString());
  }, [isEnhanceEnabled]);

  useEffect(() => {
    localStorage.setItem('bol_ai_ui_mode', isUiMode.toString());
  }, [isUiMode]);

  const nextGalleryImage = () => setGalleryIndex((prev) => (prev + 1) % exampleImages.length);
  const prevGalleryImage = () => setGalleryIndex((prev) => (prev - 1 + exampleImages.length) % exampleImages.length);

  const fetchAsBase64 = async (url: string): Promise<string> => {
    try {
      const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("Failed to fetch image");
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Fetch base64 error:", error);
      throw error;
    }
  };

  const addWatermark = async (base64Image: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Image);
          return;
        }
        ctx.drawImage(img, 0, 0);
        
        // Add watermark
        ctx.font = `bold ${Math.max(20, img.width / 25)}px Inter, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        
        // Add a slight shadow for better visibility
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        ctx.fillText('Bol-Ai', img.width - 20, img.height - 20);
        
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = reject;
      img.src = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    });
  };

  const handleDownload = async (url: string) => {
    try {
      const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("Failed to fetch image");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `bol-ai-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      console.error("Download error:", error);
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setGenerationTime(0);
      interval = setInterval(() => {
        setGenerationTime(prev => prev + 1);
      }, 1000);
    } else {
      setGenerationTime(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const UI_DESIGN_PROMPT_PREFIX = "Professional UI/UX design, high-quality user interface, modern web layout, clean digital components, sleek app design, 4k resolution, highly detailed, professional color palette, ";

  const handleGenerate = async () => {
    if (isGenerating || isEnhancing) return;
    
    setIsGenerating(true);
    if (!prompt.trim()) {
      setIsGenerating(false);
      return;
    }
    
    if (maintenanceMode === 1) {
      setIsGenerating(false);
      return;
    }
    if (maintenanceMode === 2) {
      setError("Bol-AI Server Error: Our servers are currently experiencing high load or undergoing maintenance. Please try again later. Thanks for understanding.");
      setIsGenerating(false);
      return;
    }

    if (!user) {
      setIsLoginSliderOpen(true);
      setIsGenerating(false);
      return;
    }

    console.log("Starting handleGenerate...");
    setIsEnhancing(false);
    setError(null);
    setGeneratedImage(null);
    setGeneratedSize(null);
    setEnhancedPrompt(null);
    setIsPromptExpanded(false);

    let finalPrompt = isUiMode ? `${UI_DESIGN_PROMPT_PREFIX}${prompt}` : prompt;
    const originalUserPrompt = prompt;
    let currentRequestId: string | null = null;
    const startTime = Date.now();

    try {
      // Track request in Firestore with a timeout so it doesn't block generation if offline
      console.log("Tracking request in Firestore...");
      try {
        const reqPromise = addDoc(collection(db, 'requests'), {
          userId: user ? user.uid : 'anonymous',
          userEmail: user ? (user.email || user.providerData?.find(p => p.email)?.email || 'N/A') : 'anonymous',
          userIp: userIp,
          prompt: originalUserPrompt,
          enhancedPrompt: (isEnhanceEnabled && isBolAiEnhanceGlobalEnabled) ? null : originalUserPrompt, // Will be updated if enhanced
          status: 'active',
          createdAt: serverTimestamp()
        });

        // 2 second timeout for Firestore tracking
        const reqRef = await Promise.race([
          reqPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 2000))
        ]) as any;

        currentRequestId = reqRef.id;
        console.log("Request tracked with ID:", currentRequestId);
      } catch (fsError) {
        console.warn("Firestore tracking failed or timed out, continuing without tracking:", fsError);
      }

      if (isEnhanceEnabled && isBolAiEnhanceGlobalEnabled) {
        console.log("[Bol-AI] Initiating prompt enhancement...");
        setIsEnhancing(true);
        setEnhancedPrompt(null); // Reset before new enhancement
        try {
          // Step 1: Enhance Prompt using Bol-AI Engine (via proxy)
          const enhanceRes = await fetch('/api/enhance-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: finalPrompt }),
          });

          if (enhanceRes.ok) {
            const enhanceData = await enhanceRes.json();
            if (enhanceData.enhancedPrompt && enhanceData.enhancedPrompt !== originalUserPrompt) {
              finalPrompt = enhanceData.enhancedPrompt;
              setEnhancedPrompt(finalPrompt);
              setIsPromptExpanded(true); // Automatically expand to show the "big" prompt
              console.log("[Bol-AI] Prompt successfully enhanced:", finalPrompt);
              
              // Update request with enhanced prompt in Firestore
              if (currentRequestId) {
                updateDoc(doc(db, 'requests', currentRequestId), {
                  enhancedPrompt: finalPrompt
                }).catch(err => console.warn("Firestore update failed:", err));
              }
              
              // Give user a moment to see the "Enhancing" state and the result
              await new Promise(r => setTimeout(r, 800));
            } else {
              console.warn("[Bol-AI] API returned no enhancement or same prompt.");
            }
          } else {
            const errorData = await enhanceRes.json().catch(() => ({}));
            console.warn("[Bol-AI] Prompt enhancement failed:", errorData.error || enhanceRes.statusText);
            setShowToast("Enhancement failed, using original prompt.");
          }
        } catch (err) {
          console.warn("[Bol-AI] Prompt enhancement error:", err);
        } finally {
          setIsEnhancing(false);
        }
      }

      // Step 2: Generate Image
      console.log("[Bol-AI] Sending generation request to server...");
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: finalPrompt, 
          size: selectedSize,
          quality: quality
        }),
      });

      const text = await response.text();
      console.log(`[Bol-AI] Generate response status: ${response.status}`);
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[Bol-AI] Raw response:", text);
        if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
          throw new Error(`Bol-AI Server Error: The server returned an error page (Status ${response.status}). This usually means a timeout (504) or a crash on Vercel. Please check your API keys and try again.`);
        }
        throw new Error(`Server Error: ${text.substring(0, 100)}...`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.message || `Failed to start image generation (Status ${response.status})`);
      }

      const taskId = data.task_id;
      if (!taskId) {
        throw new Error('No task ID returned from server.');
      }

      // Poll for status
      let isComplete = false;
      let attempts = 0;
      const maxAttempts = 150; // 150 * 2s = 300 seconds (5 minutes)

      while (!isComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;

        const statusRes = await fetch(`/api/tasks/${taskId}`);
        if (!statusRes.ok) continue;

        let statusData;
        try {
          statusData = await statusRes.json();
        } catch (e) {
          console.error("Failed to parse status response:", e);
          continue;
        }
        
        if (statusData.task_status === "SUCCEED") {
          if (statusData.output_images && statusData.output_images.length > 0) {
            const finalImageUrl = statusData.output_images[0];
            
            const endTime = Date.now();
            const durationMs = endTime - startTime;

            // Upload to ImgBB
            let finalDisplayUrl = finalImageUrl;
            try {
              const base64DataWithPrefix = await fetchAsBase64(finalImageUrl);
              const watermarkedBase64 = await addWatermark(base64DataWithPrefix);
              const base64Data = watermarkedBase64.includes(',') ? watermarkedBase64.split(',')[1] : watermarkedBase64;

              if (base64Data) {
                const imgbbRes = await fetch('/api/upload-imgbb', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageUrl: base64Data })
                });
                const imgbbData = await imgbbRes.json();
                if (imgbbData.success) {
                  finalDisplayUrl = imgbbData.data.url;
                }
              }
            } catch (e) {
              console.error("ImgBB Upload Failed", e);
            }

            // Update UI with the FINAL URL
            setGeneratedImage(finalDisplayUrl);
            setGeneratedSize(selectedSize);
            isComplete = true;

            // Save to Firestore for ALL users (so admin can see it)
            try {
              const newGen = {
                userId: user ? user.uid : 'anonymous',
                userEmail: user ? (user.email || user.providerData?.find(p => p.email)?.email || 'N/A') : 'anonymous',
                userIp: userIp,
                prompt: finalPrompt,
                imageUrl: finalDisplayUrl,
                size: selectedSize,
                createdAt: serverTimestamp()
              };
              
              const newDocRef = doc(collection(db, 'generations'));
              setLastGeneratedId(newDocRef.id);
              if (user) {
                setMyImages(prev => [{ id: newDocRef.id, ...newGen }, ...prev]);
              }
              
              setDoc(newDocRef, newGen).catch(dbError => {
                console.error("Failed to save to Firestore:", dbError);
              });
              console.log("Image saved to Firestore successfully!");
            } catch (dbError) {
              console.error("Failed to prepare Firestore save:", dbError);
            }

            if (!user) {
              setGenerationsCount(prev => prev + 1);
            }

            // Update request status to completed
            if (currentRequestId) {
              updateDoc(doc(db, 'requests', currentRequestId), {
                status: 'completed',
                imageUrl: finalDisplayUrl,
                durationMs: durationMs
              }).catch(err => console.warn("Firestore update failed:", err));
            }
          } else {
            throw new Error("Bol-AI succeeded but returned no images.");
          }
        } else if (statusData.task_status === "FAILED") {
          const errorMsg = statusData.message || statusData.error_msg || "Bol-AI failed to generate image.";
          throw new Error(errorMsg);
        }
      }

      if (!isComplete) {
        throw new Error("Generation Timeout (5m). Please try again.");
      }

    } catch (err: any) {
      console.error("Generation Error:", err);
      setError(err.message || "An unexpected error occurred.");
      
      // Update request status to error
      if (currentRequestId) {
        const endTime = Date.now();
        const durationMs = endTime - startTime;
        updateDoc(doc(db, 'requests', currentRequestId), {
          status: 'error',
          error: err.message || "Unknown error",
          durationMs: durationMs
        }).catch(console.error);
      }
    } finally {
      setIsGenerating(false);
      setIsEnhancing(false);
    }
  };

  return (
    <div className="min-h-screen font-sans selection:bg-neon-blue/30">
      {/* Background Elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-blue/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-purple/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5" />
      </div>

      <header className="container mx-auto px-6 py-8 flex justify-between items-center">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setActivePage('home')}
        >
          <h1 className="text-2xl font-display font-bold tracking-tight">
            BOL-<span className="text-neon-blue">AI</span>
          </h1>
        </motion.div>

        <div className="flex items-center gap-4 md:gap-8">
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
            <button onClick={() => { setActiveTab('generator'); setActivePage('home'); }} className={`transition-colors ${activeTab === 'generator' && activePage === 'home' ? 'text-neon-blue' : 'hover:text-neon-blue'}`}>Generator</button>
            <button onClick={() => { setActiveTab('text-ai'); setActivePage('home'); }} className={`transition-colors ${activeTab === 'text-ai' && activePage === 'home' ? 'text-neon-blue' : 'hover:text-neon-blue'}`}>Text AI</button>
            <button onClick={() => { setActiveTab('gallery'); setActivePage('home'); }} className={`transition-colors ${activeTab === 'gallery' && activePage === 'home' ? 'text-neon-blue' : 'hover:text-neon-blue'}`}>Gallery</button>
            {user && (
              <button onClick={() => { setActiveTab('my-creations'); setActivePage('home'); }} className={`transition-colors ${activeTab === 'my-creations' && activePage === 'home' ? 'text-neon-blue' : 'hover:text-neon-blue'}`}>My Creations</button>
            )}
          </nav>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 sm:gap-4"
          >
            <button 
              onClick={() => setIsLoginSliderOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-95 group shadow-lg shadow-black/20"
            >
              <div className="relative">
                {user && user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-neon-blue/50 group-hover:border-neon-blue transition-colors" />
                ) : (
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-neon-blue/10 flex items-center justify-center border border-neon-blue/30 group-hover:border-neon-blue/60 transition-colors">
                    <UserCircle className="w-4 h-4 sm:w-5 sm:h-5 text-neon-blue" />
                  </div>
                )}
              </div>
              <span className="hidden sm:inline font-bold text-sm tracking-tight">{user ? user.displayName?.split(' ')[0] : 'Join Elite'}</span>
            </button>
            <button onClick={() => setIsMenuOpen(true)} className="p-2 text-white/60 hover:text-white transition-colors active:scale-90">
              <Menu className="w-6 h-6" />
            </button>
          </motion.div>
        </div>
      </header>

      <main className="container mx-auto px-6 pt-12 pb-24">
        {activePage === 'home' ? (
          <>
            {/* Admin Section */}
            {activeTab === 'admin' && user?.email === 'vivekdalvi147@gmail.com' && (
              <>
                <div className="max-w-4xl mx-auto text-center mb-16">
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl md:text-6xl font-display font-bold mb-6 leading-tight"
                  >
                    Admin <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">Control</span> Center
                  </motion.h2>
                </div>
                <AdminPanel />
              </>
            )}

            {/* Text AI Section */}
            {activeTab === 'text-ai' && (
              <>
                <div className="max-w-4xl mx-auto text-center mb-12">
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl md:text-6xl font-display font-bold mb-4 leading-tight"
                  >
                    Bol-AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">Intelligence</span>
                  </motion.h2>
                  <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-white/50 text-lg max-w-2xl mx-auto mb-8"
                  >
                    Chat with our most advanced text models for coding, creative writing, and problem solving.
                  </motion.p>
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap justify-center gap-4 mb-12"
                  >
                    <button 
                      onClick={() => setActiveTab('generator')}
                      className={`px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'generator' 
                          ? 'bg-neon-blue text-black shadow-[0_0_20px_rgba(0,255,255,0.4)]' 
                          : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>Image Gen</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('text-ai')}
                      className={`px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'text-ai' 
                          ? 'bg-neon-purple text-white shadow-[0_0_20px_rgba(176,38,255,0.4)]' 
                          : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <Cpu className="w-4 h-4" />
                      <span>Text AI Chat</span>
                    </button>
                  </motion.div>
                </div>
                <TextAI />
              </>
            )}

            {/* Generator Section */}
            {activeTab === 'generator' && (
              <>
                <div className="max-w-4xl mx-auto text-center mb-16">
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-5xl md:text-7xl font-display font-bold mb-6 leading-tight"
                  >
                    Create Amazing <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">Images</span> With <br /> AI
                  </motion.h2>
                  <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-white/50 text-lg max-w-2xl mx-auto mb-8"
                  >
                    Type what you want to see, and our advanced AI will create it for you instantly.
                  </motion.p>
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap justify-center gap-4 mb-12"
                  >
                    <button 
                      onClick={() => setActiveTab('generator')}
                      className={`px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'generator' 
                          ? 'bg-neon-blue text-black shadow-[0_0_20px_rgba(0,255,255,0.4)]' 
                          : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>Image Gen</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('text-ai')}
                      className={`px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 ${
                        activeTab === 'text-ai' 
                          ? 'bg-neon-purple text-white shadow-[0_0_20px_rgba(176,38,255,0.4)]' 
                          : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <Cpu className="w-4 h-4" />
                      <span>Text AI Chat</span>
                    </button>
                  </motion.div>
                </div>
                <div className="max-w-4xl mx-auto mb-24">
          
          {/* Controls: Size Selector & Quality & Enhance Toggle */}
          <div className="flex flex-col gap-5 mb-8 max-w-md mx-auto">
            {/* Size Selector */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold ml-2">Aspect Ratio</span>
              <div className="flex gap-2 bg-black/40 p-1.5 rounded-[1.5rem] border border-white/5 shadow-2xl overflow-x-auto scrollbar-hide backdrop-blur-xl">
                {[
                  { label: "1:1", value: "1024*1024" },
                  { label: "16:9", value: "1280*720" },
                  { label: "9:16", value: "720*1280" }
                ].map((size) => (
                  <button
                    key={size.value}
                    onClick={() => setSelectedSize(size.value)}
                    className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap ${
                      selectedSize === size.value 
                        ? 'bg-gradient-to-br from-neon-blue to-cyan-500 text-black shadow-[0_0_25px_rgba(0,255,255,0.5)] scale-[1.02]' 
                        : 'text-white/40 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Maximize className="w-3.5 h-3.5 shrink-0" />
                    <span>{size.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Selector */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold ml-2">Render Quality</span>
              <div className="flex gap-2 bg-black/40 p-1.5 rounded-[1.5rem] border border-white/5 shadow-2xl overflow-x-auto scrollbar-hide backdrop-blur-xl">
                {[
                  { label: "Standard", value: "standard" },
                  { label: "HD", value: "hd" },
                  { label: "Ultra", value: "ultra" }
                ].map((q) => (
                  <button
                    key={q.value}
                    onClick={() => setQuality(q.value)}
                    className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap ${
                      quality === q.value 
                        ? 'bg-gradient-to-br from-neon-purple to-purple-600 text-white shadow-[0_0_25px_rgba(176,38,255,0.5)] scale-[1.02]' 
                        : 'text-white/40 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span>{q.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Enhance Toggle */}
            {isBolAiEnhanceGlobalEnabled && (
              <div className="flex justify-center">
                <button 
                  onClick={() => setIsEnhanceEnabled(!isEnhanceEnabled)} 
                  className={`flex items-center justify-between w-full px-6 py-3.5 rounded-[1.5rem] border transition-all duration-500 group ${
                    isEnhanceEnabled 
                      ? 'bg-neon-purple/5 border-neon-purple/30 shadow-[0_10px_30px_rgba(176,38,255,0.15)]' 
                      : 'bg-black/40 border-white/5 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl transition-colors duration-300 ${isEnhanceEnabled ? 'bg-neon-purple/20' : 'bg-white/5'}`}>
                      <Wand2 className={`w-4 h-4 ${isEnhanceEnabled ? 'text-neon-purple animate-pulse' : 'text-white/40'}`} />
                    </div>
                    <span className={`text-sm font-bold tracking-wider ${isEnhanceEnabled ? 'text-neon-purple' : 'text-white/40'}`}>
                      Bol-AI Enhance
                    </span>
                    <div className="relative ml-2">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(activeTooltip === 'enhance' ? null : 'enhance');
                        }}
                        className={`p-1.5 rounded-full transition-all duration-300 ${activeTooltip === 'enhance' ? 'bg-neon-purple/20 text-neon-purple' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        title="What is Bol-AI Enhance?"
                      >
                        <Info className="w-4 h-4" />
                      </div>
                      <AnimatePresence>
                        {activeTooltip === 'enhance' && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 p-4 bg-black/95 border border-white/10 rounded-2xl text-xs text-white/70 leading-relaxed z-[100] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-t-neon-purple/30"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse" />
                              <p className="font-bold text-neon-purple uppercase tracking-widest text-[10px]">Bol-AI Enhance</p>
                            </div>
                            <p className="mb-2">Automatically translates and expands your basic ideas into hyper-detailed, professional image generation prompts.</p>
                            <p className="text-[10px] italic text-white/40">Best for: Getting stunning results from simple descriptions.</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-500 relative ${isEnhanceEnabled ? 'bg-neon-purple' : 'bg-white/10'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-all duration-500 shadow-[0_0_10px_rgba(255,255,255,0.5)] ${isEnhanceEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            )}
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95, rotateX: 10 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0, y: [0, -5, 0] }}
            transition={{ y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
            className="glass rounded-[2.5rem] p-4 flex flex-col gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative border border-white/10 group hover:border-neon-blue/30 transition-all duration-500"
            style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
          >
            {isEnhancing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-10 bg-black/80 backdrop-blur-sm flex items-center justify-center gap-3 rounded-3xl"
              >
                <Cpu className="w-6 h-6 text-neon-purple animate-pulse" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple font-bold tracking-widest uppercase text-sm">
                  Bol-AI is enhancing your prompt...
                </span>
              </motion.div>
            )}
            
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  maxLength={2000}
                  placeholder={isUiMode ? "Describe the UI style you want to recreate..." : "Describe what you want to see (any language)..."}
                  className="w-full bg-transparent px-6 py-4 outline-none text-white placeholder:text-white/20 font-medium resize-none min-h-[80px] max-h-[300px] scrollbar-hide"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  disabled={isEnhancing || isGenerating}
                />
                <div className="text-right text-[10px] text-white/30 px-2">
                  {prompt.length}/2000
                </div>
              </div>
              
              <div className="flex flex-col gap-2 justify-end">
                <div className="flex gap-2">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsUiMode(!isUiMode)}
                      className={`p-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${isUiMode ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,255,255,0.3)]' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                      disabled={isEnhancing || isGenerating}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span className="hidden md:inline">UI MODE</span>
                    </button>
                    <div className="relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTooltip(activeTooltip === 'uimode' ? null : 'uimode');
                        }}
                        className={`p-2 rounded-xl transition-all duration-300 ${activeTooltip === 'uimode' ? 'bg-neon-blue/20 text-neon-blue' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        title="What is UI Mode?"
                      >
                        <Info className="w-5 h-5" />
                      </button>
                      <AnimatePresence>
                        {activeTooltip === 'uimode' && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full right-0 md:left-1/2 md:-translate-x-1/2 mb-4 w-64 p-4 bg-black/95 border border-white/10 rounded-2xl text-xs text-white/70 leading-relaxed z-[100] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-t-neon-blue/30"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse" />
                              <p className="font-bold text-neon-blue uppercase tracking-widest text-[10px]">UI Design Engine</p>
                            </div>
                            <p className="mb-2">UI Mode optimizes the AI to generate <span className="text-white font-medium">professional user interfaces</span>, web layouts, and app components.</p>
                            <p className="text-[10px] italic text-white/40">Best for: Landing pages, Dashboards, Mobile App Screens, and UI Kits.</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating || isEnhancing || maintenanceMode === 1}
                  className="bg-gradient-to-r from-neon-blue to-neon-purple px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {generationTime}s
                    </>
                  ) : (
                    <>
                      Generate
                      <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Maintenance Mode Warning */}
          <AnimatePresence>
            {maintenanceMode === 1 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-400"
              >
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <p className="text-sm font-medium">Bol-AI is currently under maintenance. Image generation is temporarily paused. Please check back later.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Enhanced Prompt Display (Collapsible) */}
          <AnimatePresence>
            {enhancedPrompt && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-6 glass rounded-3xl border border-neon-purple/40 shadow-[0_0_30px_rgba(176,38,255,0.15)] overflow-hidden"
              >
                <button 
                  onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                  className="w-full p-5 flex items-center justify-between hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3 text-neon-purple font-bold text-base md:text-lg">
                    <Cpu className="w-6 h-6 group-hover:animate-pulse" />
                    <span>Prompt Upgraded by Bol-AI</span>
                  </div>
                  <motion.div animate={{ rotate: isPromptExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
                    <ChevronDown className="w-6 h-6 text-neon-purple" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {isPromptExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="p-5 pt-0 border-t border-white/10 mt-2 bg-black/20">
                        <p className="italic leading-relaxed text-sm md:text-base text-white/80">"{enhancedPrompt}"</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result Display */}
          <AnimatePresence mode="wait">
            {(generatedImage || isGenerating || error) && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-12"
              >
                <div 
                  className="glass rounded-[2rem] overflow-hidden relative group flex items-center justify-center bg-black/60 mx-auto transition-all duration-500"
                  style={{
                    aspectRatio: generatedSize === "1280*720" ? "16/9" : generatedSize === "720*1280" ? "9/16" : "1/1",
                    maxHeight: "80vh",
                    width: generatedSize === "720*1280" ? "auto" : "100%",
                    maxWidth: generatedSize === "720*1280" ? "calc(80vh * (9/16))" : "100%"
                  }}
                >
                  {isGenerating ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 backdrop-blur-md p-6 text-center">
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin" />
                        <Sparkles className="absolute inset-0 m-auto text-neon-blue w-8 h-8 animate-pulse" />
                      </div>
                      <p className="text-neon-blue font-bold tracking-widest uppercase text-sm mt-2">Generating Masterpiece... ({generationTime}s)</p>
                      
                      {/* Progress Bar */}
                      <div className="w-full max-w-xs bg-black/40 rounded-full h-1.5 mt-2 overflow-hidden border border-white/5">
                        <motion.div 
                          className="bg-gradient-to-r from-neon-blue to-neon-purple h-full" 
                          initial={{ width: "0%" }} 
                          animate={{ width: "95%" }} 
                          transition={{ duration: 45, ease: "easeOut" }} 
                        />
                      </div>
                      
                      <p className="text-white/50 text-xs mt-2 max-w-xs leading-relaxed">
                        Image loading time may vary depending on your internet connection and server load. Please wait.
                      </p>
                    </div>
                  ) : error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                        <Info className="text-red-500 w-8 h-8" />
                      </div>
                      <p className="text-red-400 font-medium">{error}</p>
                      <button onClick={handleGenerate} className="text-sm text-white/40 hover:text-white underline">Try Again</button>
                    </div>
                  ) : (
                    <>
                      <img 
                        src={generatedImage!} 
                        alt="Generated" 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 pointer-events-none select-none"
                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                        onContextMenu={(e) => e.preventDefault()}
                        referrerPolicy="no-referrer"
                      />
                      <img 
                        src="/bol-ai-logo.png" 
                        alt="Bol-AI Logo" 
                        className="absolute top-4 right-4 w-12 h-12 md:w-16 md:h-16 object-contain opacity-80 drop-shadow-lg pointer-events-none z-10" 
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 md:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 rounded-b-[2rem]">
                        <div className="flex flex-col gap-2 flex-1">
                          {generatedSize && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-medium text-neon-blue w-fit backdrop-blur-md shadow-[0_0_10px_rgba(0,255,255,0.1)]">
                              <Maximize className="w-3 h-3" />
                              {generatedSize.replace('*', ' × ')}
                            </span>
                          )}
                          <p className="text-sm text-white/90 line-clamp-3 italic font-medium">"{enhancedPrompt || prompt}"</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button 
                            onClick={() => handleDownload(generatedImage!)}
                            className="w-full sm:w-auto px-8 py-3 bg-neon-blue text-black font-bold rounded-2xl hover:bg-white hover:text-black transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,255,255,0.5)] hover:shadow-[0_0_30px_rgba(255,255,255,0.8)] active:scale-95 shrink-0"
                          >
                            <Download className="w-5 h-5" />
                            Download
                          </button>
                          {lastGeneratedId && (
                            <button 
                              onClick={() => handleShare(lastGeneratedId)}
                              className="w-full sm:w-auto px-8 py-3 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 border border-white/10 active:scale-95 shrink-0"
                            >
                              <Share2 className="w-5 h-5" />
                              Share
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </>
        )}

        {/* Gallery Section */}
        {activeTab === 'gallery' && (
        <section id="gallery" className="mt-12">
          <div className="flex items-center gap-4 mb-12">
            <LayoutGrid className="text-neon-purple w-6 h-6" />
            <h3 className="text-3xl font-display font-bold">Gallery</h3>
          </div>
          
          <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
            {exampleImages.map((img, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: (idx % 4) * 0.1, ease: "easeOut" }}
                className="relative group break-inside-avoid rounded-3xl overflow-hidden glass border border-white/10 shadow-lg"
              >
                <img 
                  src={img.startsWith('http') ? img : `/examples/${img}`} 
                  alt={`Gallery ${idx + 1}`}
                  className="w-full h-auto object-contain transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://picsum.photos/seed/ai${idx}/800/800`;
                  }}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/10 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="text-white font-display font-bold text-[10px] tracking-widest uppercase">Bol-Ai</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-end p-4">
                  <button 
                    onClick={() => handleDownload(img.startsWith('http') ? img : `/examples/${img}`)}
                    className="p-3 bg-neon-blue text-black rounded-xl hover:bg-white transition-colors active:scale-95 shadow-[0_0_15px_rgba(0,255,255,0.4)]"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
        )}

        {/* My Creations Section */}
        {activeTab === 'my-creations' && (
          <section id="my-creations" className="mt-12">
            <div className="flex items-center gap-4 mb-12">
              <ImageIcon className="text-neon-blue w-6 h-6" />
              <h3 className="text-3xl font-display font-bold">My Creations</h3>
            </div>
            
            {myImages.length === 0 ? (
              <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
                <ImageIcon className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <p className="text-white/50 text-lg">You haven't generated any images yet.</p>
                <button onClick={() => setActiveTab('generator')} className="mt-6 px-6 py-2 bg-neon-blue/20 text-neon-blue rounded-xl hover:bg-neon-blue/30 transition-colors">Go to Generator</button>
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
                {myImages.map((img, idx) => (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: (idx % 4) * 0.1 }}
                    className="relative group break-inside-avoid rounded-3xl overflow-hidden glass border border-white/10 shadow-lg"
                  >
                    <img 
                      src={img.imageUrl} 
                      alt={img.prompt}
                      className="w-full h-auto object-contain transition-transform duration-700 group-hover:scale-105"
                      onContextMenu={(e) => e.preventDefault()}
                      referrerPolicy="no-referrer"
                    />
                    {/* Controls Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleShare(img.id)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-md transition-colors" title="Share">
                          <Share2 className="w-4 h-4 text-white" />
                        </button>
                        <button onClick={() => handleDelete(img.id)} className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded-xl backdrop-blur-md transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                      <div>
                        <p className="text-xs text-white/70 line-clamp-2 mb-3">{img.prompt}</p>
                        <button 
                          onClick={() => handleDownload(img.imageUrl)}
                          className="w-full py-2 bg-neon-blue text-black font-bold rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          <Download className="w-4 h-4" /> Download
                        </button>
                      </div>
                    </div>
                    {/* Mobile Controls (Always Visible on small screens) */}
                    <div className="p-3 bg-black/40 backdrop-blur-md border-t border-white/5 sm:hidden">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleDownload(img.imageUrl)}
                          className="flex-1 py-2 bg-neon-blue text-black font-bold rounded-lg flex items-center justify-center gap-2 text-[10px]"
                        >
                          <Download className="w-3 h-3" /> Download
                        </button>
                        <button onClick={() => handleShare(img.id)} className="p-2 bg-white/10 rounded-lg border border-white/10">
                          <Share2 className="w-3.5 h-3.5 text-white" />
                        </button>
                        <button onClick={() => handleDelete(img.id)} className="p-2 bg-red-500/20 rounded-lg border border-red-500/20">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
          )}
          </>
        ) : activePage === 'about' ? (
          <section className="max-w-4xl mx-auto py-12">
            <h2 className="text-4xl font-display font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-white">About Us</h2>
            <div className="glass p-8 rounded-3xl border border-white/10 space-y-6 text-white/80 leading-relaxed">
              <p>Bol-AI is the world's most advanced AI image generation powerhouse. We bridge the gap between human imagination and digital reality.</p>
              <p>Our mission is to empower creators, designers, and visionaries with cutting-edge artificial intelligence tools that transform ideas into stunning visual masterpieces instantly.</p>
              <p>Built with state-of-the-art neural networks and optimized for speed and quality, Bol-AI represents the future of creative expression.</p>
            </div>
          </section>
        ) : activePage === 'privacy' ? (
          <section className="max-w-4xl mx-auto py-12">
            <h2 className="text-4xl font-display font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-white">Privacy Policy</h2>
            <div className="glass p-8 rounded-3xl border border-white/10 space-y-6 text-white/80 leading-relaxed">
              <p>At Bol-AI, your creativity is private. We employ end-to-end encryption for your prompts and never store your generated masterpieces without your explicit consent.</p>
              <h3 className="text-xl font-bold text-white mt-8 mb-4">Data Collection</h3>
              <p>We collect minimal data necessary to provide our services, including your IP address for security purposes and your email address if you choose to create an account.</p>
              <h3 className="text-xl font-bold text-white mt-8 mb-4">Data Usage</h3>
              <p>Your data is used exclusively to improve your experience, manage your account, and ensure the security of our platform. We do not sell your personal information to third parties.</p>
            </div>
          </section>
        ) : activePage === 'contact' ? (
          <section className="max-w-4xl mx-auto py-12">
            <h2 className="text-4xl font-display font-bold mb-8 text-white">Contact Us</h2>
            <div className="glass p-8 rounded-3xl border border-white/10 space-y-6 text-white/80 leading-relaxed">
              <p>Ready to take your creativity to the next level? Our elite support team is here to assist you 24/7.</p>
              <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10 inline-block">
                <p className="text-sm text-white/50 mb-2 uppercase tracking-widest font-bold">Direct Comms Link</p>
                <a href="mailto:vivekdalvi147@gmail.com" className="text-2xl font-bold text-neon-blue hover:text-white transition-colors break-all">
                  vivekdalvi147@gmail.com
                </a>
              </div>
            </div>
          </section>
        ) : null}
      </main>

        <footer className="border-t border-white/10 py-12 mt-32 bg-black/60 backdrop-blur-2xl relative overflow-hidden">
          <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <Sparkles className="text-neon-blue w-5 h-5" />
              <span className="font-display font-bold text-xl">BOL-<span className="text-neon-blue">AI</span></span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-white/60">
              <button onClick={() => { setActiveTab('generator'); setActivePage('home'); window.scrollTo(0, 0); }} className="hover:text-neon-blue transition-colors">Generator</button>
              <button onClick={() => { setActiveTab('text-ai'); setActivePage('home'); window.scrollTo(0, 0); }} className="hover:text-neon-blue transition-colors">Text AI</button>
              <button onClick={() => { setActivePage('about'); window.scrollTo(0, 0); }} className="hover:text-neon-blue transition-colors">About Us</button>
              <button onClick={() => { setActivePage('privacy'); window.scrollTo(0, 0); }} className="hover:text-neon-purple transition-colors">Privacy Policy</button>
              <button onClick={() => { setActivePage('contact'); window.scrollTo(0, 0); }} className="hover:text-white transition-colors">Contact Us</button>
              {user?.email === 'vivekdalvi147@gmail.com' && (
                <button onClick={() => { setActiveTab('admin'); setActivePage('home'); window.scrollTo(0, 0); }} className="hover:text-red-500 transition-colors">Admin</button>
              )}
            </div>
            <div className="flex flex-col items-center md:items-end gap-1">
              <p className="text-white/40 text-sm">© 2026 Bol-AI. All rights reserved.</p>
              <p className="text-neon-purple/70 text-xs font-bold tracking-wider uppercase">Developer Vivek Dalvi</p>
            </div>
          </div>
        </footer>

      {/* Sidebar Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-full max-w-sm bg-black/90 backdrop-blur-2xl border-r border-white/10 z-50 p-8 flex flex-col shadow-[20px_0_50px_rgba(0,0,0,0.5)]"
            >
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="mt-12 flex flex-col gap-8 flex-1 overflow-y-auto pr-4 custom-scrollbar">
                <div className="flex items-center gap-3 mb-4 shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-neon-blue to-neon-purple rounded-xl flex items-center justify-center shadow-lg shadow-neon-blue/20">
                    <Sparkles className="text-white w-6 h-6" />
                  </div>
                  <h2 className="text-3xl font-display font-bold tracking-tight">
                    BOL-<span className="text-neon-blue">AI</span>
                  </h2>
                </div>

                <nav className="flex flex-col gap-4 text-lg font-medium text-white/70 shrink-0">
                  <button onClick={() => { setActiveTab('generator'); setIsMenuOpen(false); }} className="text-left hover:text-neon-blue transition-colors py-2">Generator</button>
                  <button onClick={() => { setActiveTab('text-ai'); setIsMenuOpen(false); }} className="text-left hover:text-neon-blue transition-colors py-2">Text AI</button>
                  <button onClick={() => { setActiveTab('gallery'); setIsMenuOpen(false); }} className="text-left hover:text-neon-blue transition-colors py-2">Gallery</button>
                  {user && (
                    <button onClick={() => { setActiveTab('my-creations'); setIsMenuOpen(false); }} className="text-left hover:text-neon-blue transition-colors py-2">My Creations</button>
                  )}
                </nav>

                <div className="h-px bg-white/10 my-2 shrink-0" />

                <div className="flex flex-col gap-8 pb-8">
                  <div className="space-y-4">
                    <h4 className="text-2xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-white">About Us</h4>
                    <p className="text-white/60 text-sm leading-relaxed">
                      Bol-AI is the world's most advanced AI image generation powerhouse. We bridge the gap between human imagination and digital reality.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-2xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-white">Privacy Policy</h4>
                    <p className="text-white/60 text-sm leading-relaxed">
                      At Bol-AI, your creativity is private. We employ end-to-end encryption for your prompts and never store your generated masterpieces without your explicit consent.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-2xl font-display font-bold text-white">Contact Us</h4>
                    <p className="text-white/60 text-sm leading-relaxed mb-2">
                      Ready to take your creativity to the next level? Our elite support team is here to assist you 24/7.
                    </p>
                    <a href="mailto:vivekdalvi147@gmail.com" className="text-lg font-bold text-neon-blue hover:text-white transition-colors break-all">
                      vivekdalvi147@gmail.com
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Shared Image Modal */}
      <AnimatePresence>
        {sharedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <button 
              onClick={() => setSharedImage(null)}
              className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="max-w-5xl w-full bg-black/80 border border-white/10 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col md:flex-row relative max-h-[95vh] overflow-y-auto md:overflow-hidden">
              <div className="w-full md:flex-1 relative bg-black flex items-center justify-center p-4 md:p-8 min-h-[40vh] md:min-h-0">
                <img 
                  src={sharedImage.imageUrl} 
                  alt="Shared Image" 
                  className="max-h-[60vh] md:max-h-[80vh] w-full object-contain rounded-2xl shadow-2xl"
                  onContextMenu={(e) => e.preventDefault()}
                />
                <div className="absolute top-6 left-6 md:top-8 md:left-8 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-bold text-neon-blue uppercase tracking-widest">
                  <Sparkles className="w-3 h-3" />
                  Bol-Ai Creation
                </div>
              </div>
              <div className="w-full md:w-[400px] p-6 md:p-12 flex flex-col justify-between bg-gradient-to-b from-white/5 to-transparent backdrop-blur-3xl border-t md:border-t-0 md:border-l border-white/10 shrink-0">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neon-blue/20 flex items-center justify-center border border-neon-blue/30">
                      <UserCircle className="w-6 h-6 text-neon-blue" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Creator</p>
                      <p className="text-sm font-bold text-white">{sharedImage.userEmail?.split('@')[0] || 'Anonymous'}</p>
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-white">Shared Masterpiece</h3>
                  <div className="relative">
                    <p className="text-white/70 text-sm leading-relaxed italic line-clamp-[10] relative z-10">
                      "{sharedImage.prompt}"
                    </p>
                    <div className="absolute -top-4 -left-4 text-6xl text-white/5 font-serif">"</div>
                  </div>
                </div>

                <div className="mt-8 space-y-4">
                  <button 
                    onClick={() => handleDownload(sharedImage.imageUrl)}
                    className="w-full py-4 bg-neon-blue text-black font-bold rounded-2xl hover:bg-white transition-all duration-300 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(0,255,255,0.3)] active:scale-95"
                  >
                    <Download className="w-5 h-5" /> Download Masterpiece
                  </button>
                  <button 
                    onClick={() => { setSharedImage(null); setActivePage('home'); setActiveTab('generator'); }}
                    className="w-full py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10 transition-all border border-white/10 flex items-center justify-center gap-3 active:scale-95"
                  >
                    <Wand2 className="w-5 h-5 text-neon-purple" /> Create Your Own
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Login Slider */}
      <AnimatePresence>
        {isLoginSliderOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLoginSliderOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-black/90 backdrop-blur-2xl border-l border-white/10 z-50 p-8 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)] overflow-y-auto scrollbar-hide"
            >
              <button 
                onClick={() => setIsLoginSliderOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="mt-12 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-neon-blue via-neon-purple to-neon-blue rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(0,255,255,0.3)] mb-6 animate-pulse">
                  <Sparkles className="text-white w-10 h-10" />
                </div>
                <h2 className="text-4xl font-display font-bold tracking-tighter mb-2">
                  BOL-<span className="text-neon-blue">AI</span>
                </h2>
                <p className="text-[10px] text-neon-purple font-bold tracking-[0.2em] uppercase mb-8">Next-Gen Image Engine</p>
                           {!user ? (
                  <>
                    <p className="text-white/60 mb-8 text-sm leading-relaxed">
                      Log in to unlock unlimited 8K image generation and save your creations to the cloud.
                    </p>
                    <button 
                      onClick={async () => {
                        setLoginError(null);
                        try {
                          await signInWithPopup(auth, googleProvider);
                          setIsLoginSliderOpen(false);
                        } catch (error: any) {
                          if (error.code === 'auth/popup-closed-by-user') {
                            setLoginError("Login was cancelled. Please try again.");
                          } else if (error.code === 'auth/popup-blocked') {
                            setLoginError("Login popup was blocked. Please allow popups for this site.");
                          } else {
                            setLoginError("Login failed: " + error.message);
                            console.error("Login failed:", error);
                          }
                        }
                      }}
                      className="w-full py-4 px-6 rounded-2xl bg-white text-black font-bold flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-[0_0_30px_rgba(255,255,255,0.3)] active:scale-95"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Continue with Google
                    </button>
                    {loginError && (
                      <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center animate-shake">
                        {loginError}
                      </div>
                    )}
                    <p className="text-white/40 mt-6 text-[10px] italic text-center">
                      Note: If login fails, please ensure popups are allowed for this site.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-8 flex flex-col items-center">
                      <div className="relative">
                        {user.photoURL ? (
                          <img src={user.photoURL} alt="Profile" className="w-24 h-24 rounded-full border-4 border-neon-blue/30 mb-4 shadow-[0_0_40px_rgba(0,255,255,0.3)]" />
                        ) : (
                          <div className="w-24 h-24 rounded-full border-4 border-neon-blue/30 mb-4 shadow-[0_0_40px_rgba(0,255,255,0.3)] bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center text-4xl font-bold text-white uppercase">
                            {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
                          </div>
                        )}
                      </div>
                      <h3 className="text-2xl font-bold text-white">{user.displayName}</h3>
                      <p className="text-white/40 text-sm font-mono">{user.email}</p>
                    </div>
                    <button 
                      onClick={async () => {
                        await signOut(auth);
                      }}
                      className="w-full py-4 px-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 font-bold flex items-center justify-center gap-3 hover:bg-red-500/20 transition-all active:scale-95"
                    >
                      <LogOut className="w-5 h-5" />
                      Sign Out
                    </button>
                  </>
                )}

                <div className="mt-12 w-full space-y-6 text-left pb-12">
                  <div className="p-6 glass rounded-3xl border border-white/5 hover:border-neon-blue/20 transition-all group">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                      <Info className="w-4 h-4 text-neon-blue" /> About Bol-AI
                    </h4>
                    <p className="text-xs text-white/50 leading-relaxed">
                      Bol-AI is the world's most advanced 8K image generation engine. Built on proprietary neural architectures, we empower creators to manifest their wildest imaginations into hyper-realistic digital masterpieces. Our mission is to democratize high-end AI art through speed, precision, and unparalleled visual fidelity.
                    </p>
                  </div>

                  <div className="p-6 glass rounded-3xl border border-white/5 hover:border-neon-purple/20 transition-all group">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                      <ShieldCheck className="w-4 h-4 text-neon-purple" /> Privacy Policy
                    </h4>
                    <p className="text-xs text-white/50 leading-relaxed">
                      We take your privacy seriously. All prompts are processed through end-to-end encrypted tunnels. We do not store your personal data beyond what is necessary for authentication. Your creations remain your intellectual property, and we never use them to train our models without explicit consent.
                    </p>
                  </div>

                  <div className="p-6 glass rounded-3xl border border-white/5 hover:border-white/20 transition-all group">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                      <Mail className="w-4 h-4 text-white" /> Contact Us
                    </h4>
                    <p className="text-xs text-white/50 leading-relaxed mb-4">
                      Have questions or need technical support? Our dedicated team is here to help you 24/7. Reach out to us for enterprise solutions or general inquiries.
                    </p>
                    <a href="mailto:vivekdalvi147@gmail.com" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neon-blue/10 text-neon-blue font-bold text-xs hover:bg-neon-blue/20 transition-colors">
                      <Mail className="w-3 h-3" /> vivekdalvi147@gmail.com
                    </a>
                  </div>

                  <div className="pt-8 text-center border-t border-white/5">
                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-[0.3em] mb-2">Developed by</p>
                    <p className="text-lg font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">Vivek Dalvi</p>
                    <p className="text-[10px] text-white/40 mt-2">© 2026 Bol-AI. All rights reserved.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-white font-bold shadow-2xl flex items-center gap-3"
          >
            <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse" />
            {showToast}
            <button onClick={() => setShowToast(null)} className="ml-2 text-white/40 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
