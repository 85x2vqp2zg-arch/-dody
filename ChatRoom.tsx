import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { ref, push, onValue, set, remove, update, serverTimestamp as rtdbTimestamp, get as rtdbGet } from 'firebase/database';
import { auth, db, rtdb } from '../firebase';
import { Send, LogOut, MessageSquare, Crown, User as UserIcon, ChevronLeft, Trash2, ShieldCheck, Shield, Sparkles, Ban, VolumeX, UserMinus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  text: string;
  uid: string;
  email?: string;
  displayName: string;
  photoURL: string;
  timestamp: any;
  membership?: 'premium' | 'influencer' | 'famous';
  isVip?: boolean;
}

export default function ChatRoom({ room, roomName, onBack, onOpenDM, userData }: { room: string; roomName: string; onBack: () => void, onOpenDM?: (u: any) => void, userData?: any }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [joinTime] = useState(() => Date.now());
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [userMembership, setUserMembership] = useState<string | null>(userData?.membership || null);
  const [userIsVip, setUserIsVip] = useState(!!userData?.isVip);
  const [adminTargetUser, setAdminTargetUser] = useState<any | null>(null);
  const [successAction, setSuccessAction] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [showRoyalEntry, setShowRoyalEntry] = useState(false);
  const [profilesCache, setProfilesCache] = useState<Record<string, any>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Royal Entry Notification Listener
    const entryRef = ref(rtdb, `rooms/${room}/entry_events`);
    const unsubscribeEntry = onValue(entryRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.timestamp > Date.now() - 5000) { // Only show if event is fresh (last 5s)
        setShowRoyalEntry(true);
        setTimeout(() => setShowRoyalEntry(false), 4000); // Auto hide after 4s
      }
    });

    // If current user is the developer, trigger the entry event
    if (auth.currentUser?.email === 'lm656508@gmail.com') {
      window.localStorage.setItem('dody_golden_id', '11111'); // Local hint
      set(entryRef, {
        timestamp: Date.now(),
        type: 'royal_entry'
      });
    }

    return () => unsubscribeEntry();
  }, [room]);

  useEffect(() => {
    if (userData) {
      setUserIsVip(!!userData.isVip);
      setUserMembership(userData.isVip ? userData.membership : null);
      setUsername(userData.username || null);
      setIsMuted(!!userData.isMuted);
    }
  }, [userData]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Unified Meta Listener for self (Muted, Banned, Membership, VIP Status)
    // Even if App.tsx monitors this, we keep a dedicated one for Banned detection just in case.
    const unsubMeta = onSnapshot(doc(db, 'users', auth.currentUser.uid), (docSnap: any) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.isBanned) {
          alert('لقد تم طردك نهائياً من التطبيق بواسطة الإدارة ⚠️');
          auth.signOut();
        }
      }
    }, (err) => console.error("Self Meta Error:", err.message || err));

    return () => unsubMeta();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Live RTDB Sync specifically requested for the current user
    const userStatusRef = ref(rtdb, `users/${auth.currentUser.uid}`);
    const unsubRTDB = onValue(userStatusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setUserIsVip(!!data.isVip);
        setUserMembership(data.isVip ? data.membership : null);
        setUsername(data.username || null);
        setIsMuted(!!data.isMuted);
      }
    });

    // Global listener for users node to ensure everyone sees rank changes instantly
    const allUsersRef = ref(rtdb, 'users');
    const unsubAll = onValue(allUsersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setProfilesCache(data);
      }
    });

    return () => {
      unsubRTDB();
      unsubAll();
    };
  }, []);

  useEffect(() => {
    // Realtime Database for Instant Sync
    const messagesRef = ref(rtdb, `rooms/${room}/messages`);
    
    // Using onValue to listen for real-time changes
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgList = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        })) as Message[];
        
        // Robust sorting with fallback for pending server timestamps
        msgList.sort((a, b) => {
          const tA = a.timestamp || Date.now();
          const tB = b.timestamp || Date.now();
          return tA - tB;
        });
        
        // Apply joinTime filter: only messages since joining
        const recentMessages = msgList.filter(m => {
          const mTime = m.timestamp || Date.now();
          return mTime >= joinTime;
        });

        setMessages(recentMessages.filter(m => {
          // If profile exists or it's a system announcement, keep it
          // Otherwise, if it's been more than 10 seconds and still no profile, it's likely a ghost
          if (m.uid === 'system_announcement') return true;
          const hasProfile = profilesCache[m.uid] || data[m.id]; // data[m.id] has inline profile
          return !!hasProfile;
        }));
      } else {
        setMessages([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("RTDB Error:", error.message || error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [room]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !auth.currentUser || isMuted) return;

    const text = inputText;
    setInputText('');

    try {
      // Determine membership
      let membership = userMembership;
      const isVip = userIsVip;

      // Auto-assign famous to manager if not already set
      if (auth.currentUser.email === 'lm656508@gmail.com') {
        if (!membership) membership = 'famous';
      }

      // 1. RTDB Sync - Primary for real-time
      const messagesRef = ref(rtdb, `rooms/${room}/messages`);
      const newMessageRef = push(messagesRef);
      const isDev = auth.currentUser.email === 'lm656508@gmail.com' || auth.currentUser.uid === 'dev_admin_account_lm656508';
      
        const payload = {
        text,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        displayName: userData?.displayName || (isDev ? 'دودي-Dody 👑' : (auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown')),
        photoURL: userData?.photoURL || auth.currentUser.photoURL || '',
        timestamp: rtdbTimestamp(),
        membership: userMembership, // Use current active membership
        isVip: userIsVip || isDev,
        isManager: isDev, // Privacy flag
        username: isDev ? 'aa' : (username || null)
      };

      await set(newMessageRef, payload);

      // 2. Firestore Persistence - Secondary backup
      await addDoc(collection(db, 'rooms', room, 'messages'), payload);
    } catch (err: any) {
      console.error("Error sending message:", err.message || err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return;
    
    try {
      await remove(ref(rtdb, `rooms/${room}/messages/${messageId}`));
    } catch (err: any) {
      console.error("Error deleting message:", err.message || err);
      alert("فشل في حذف الرسالة.");
    }
  };

  const currentUserEmail = auth.currentUser?.email;
  const isAdmin = currentUserEmail === 'lm656508@gmail.com';

  const grantMembership = async (type: 'premium' | 'influencer' | 'famous' | null) => {
    if (!adminTargetUser || !auth.currentUser) return;
    const targetUserId = adminTargetUser.uid;

    // Optimistic Update for immediate UI feedback
    if (type) {
      setProfilesCache(prev => ({
        ...prev,
        [targetUserId]: { ...prev[targetUserId], isVip: true, membership: type }
      }));
    }

    const userRef = ref(rtdb, `users/${targetUserId}`);
    update(userRef, {
      isVip: type !== null,
      membership: type,
    }).then(async () => {
      setSuccessAction(type || 'remove');
      // Update Firestore for long-term storage
      await setDoc(doc(db, 'users', targetUserId), { 
        isVip: type !== null, 
        membership: type, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });

      // Announcement
      const rankNames = { premium: 'المميز', influencer: 'المؤثر', famous: 'المشهور' };
      const messageText = type 
        ? `🎊 تم منح رتبة #${rankNames[type]} للمستخدم (${adminTargetUser.displayName}) بواسطة المطور دودي-Dody 👑`
        : `⚠️ تم سحب المزايا الملكية من المستخدم (${adminTargetUser.displayName}) بواسطة المطور دودي-Dody`;

      await set(push(ref(rtdb, `rooms/${room}/messages`)), {
        text: messageText,
        uid: 'system_announcement',
        displayName: 'إشعار ملكي 👑',
        photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=Crown',
        timestamp: rtdbTimestamp(),
        membership: 'famous',
        isVip: true
      });

      setTimeout(() => {
        setAdminTargetUser(null);
        setSuccessAction(null);
      }, 1500);
    }).catch((error) => {
      alert('خطأ في التنفيذ: ' + error.message);
    });
  };

  const toggleMute = async () => {
    if (!adminTargetUser) return;
    try {
      const targetUserId = adminTargetUser.uid;
      const userRef = doc(db, 'users', targetUserId);
      const userSnap = await getDoc(userRef);
      const currentlyMuted = userSnap.exists() ? !!userSnap.data().isMuted : false;
      const newMuteStatus = !currentlyMuted;
      
      // Update Firestore
      await setDoc(userRef, { isMuted: newMuteStatus }, { merge: true });
      
      // Update RTDB (Direct Link)
      await update(ref(rtdb, 'users/' + targetUserId), { isMuted: newMuteStatus });

      console.log('تم التحديث بنجاح ✅ - حالة الكتم:', newMuteStatus);
      alert('تم تحديث البيانات في Firebase ✅');
      
      setSuccessAction('mute');
      setTimeout(() => {
        setAdminTargetUser(null);
        setSuccessAction(null);
      }, 1500);
    } catch (err: any) {
      console.error("Mute toggle error:", err.message || err);
      alert("فشل التحكم بالكتم");
      setSuccessAction(null);
    }
  };

  const handleKick = async () => {
    if (!adminTargetUser) return;
    if (!confirm('هل أنت متأكد من طرد هذا المستخدم نهائياً؟')) return;
    try {
      const targetUserId = adminTargetUser.uid;
      setSuccessAction('kick');
      const userRef = doc(db, 'users', targetUserId);
      
      await setDoc(userRef, { isBanned: true }, { merge: true });
      await update(ref(rtdb, 'users/' + targetUserId), { isBanned: true });

      console.log('تم طرد المستخدم بنجاح ✅');
      alert('تم تحديث البيانات في Firebase ✅');
      
      setTimeout(() => {
        setAdminTargetUser(null);
        setSuccessAction(null);
      }, 1500);
    } catch (err) {
      alert('فشل عملية الطرد');
      setSuccessAction(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#05070a] text-white font-arabic" dir="rtl">
      {/* Immersive Background */}
      <div className="absolute inset-0 bg-[#05070a] -z-10" />
      <div className="absolute top-0 right-0 w-full h-[50%] bg-gradient-to-b from-indigo-900/10 to-transparent -z-10" />
      
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-6 border-b border-white/5 bg-[#0a0f18]/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-indigo-600/20 rounded-full transition-all text-indigo-400 group active:scale-90"
          >
            <ChevronLeft className="w-5 h-5 rotate-180 group-hover:translate-x-0.5 transition-transform" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-[#05070a] rounded-xl border border-white/10 overflow-hidden">
               <div className="text-xl">🤴</div>
            </div>
              <div className="flex flex-col items-start">
                <span className="text-sophisticated-gold text-[9px] font-black tracking-[0.2em] uppercase opacity-70 mb-0.5">
                  شاتنا - CHATNA
                </span>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black gold-gradient-text">
                    <span>قاعة {roomName}</span>
                  </h2>
                  {isAdmin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[8px] text-green-400 font-black uppercase tracking-widest">مباشر الآن</span>
              </div>
            </div>
          </div>

        <button 
          onClick={() => auth.signOut()}
          className="w-10 h-10 flex items-center justify-center bg-red-500/5 hover:bg-red-500/20 border border-red-500/10 rounded-xl transition-all text-red-400 active:scale-95"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-8 space-y-6 scroll-smooth relative"
      >
        <AnimatePresence>
          {showRoyalEntry && (
            <motion.div 
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.y < -20) setShowRoyalEntry(false);
              }}
              className="fixed top-24 left-4 right-4 z-[60] flex justify-center pointer-events-none"
            >
              <div className="bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 p-[1px] rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.4)] pointer-events-auto">
                <div className="bg-[#0a0f18] px-6 py-2.5 rounded-2xl flex items-center gap-3">
                  <div className="bg-amber-500/20 p-1.5 rounded-lg">
                    <Crown className="w-5 h-5 text-amber-500 fill-amber-500 animate-pulse" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-black gold-gradient-text uppercase tracking-tighter">
                      <span>👑 تم دخول المطور دودي-Dody إلى الغرفة الآن</span>
                    </span>
                    <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full"
            />
            <p className="text-indigo-400 text-[10px] font-black tracking-widest animate-pulse">جاري الاتصال الملكي...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-30">
            <MessageSquare className="w-16 h-16 mb-4 text-indigo-400" />
            <p className="text-lg font-bold">بدء المحادثة</p>
            <p className="text-xs">تكلم بما يليق بفخامتك</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const isMe = msg.uid === auth.currentUser?.uid;
                const realAdminUid = window.localStorage.getItem('admin_uid_cache') || (window as any).OFFICIAL_ADMIN_UID;
                const msgIsManager = msg.uid === realAdminUid || (msg as any).username === 'aa' || (msg as any).isManager === true;
                
                // Reactive sync - checks profilesCache first for real-time rank updates
                const liveProfile = profilesCache[msg.uid] || {};
                let hasVip = (liveProfile.isVip || msg.isVip || msgIsManager);
                let membershipType = hasVip ? (liveProfile.membership || msg.membership) : null;
                
                if (isMe) {
                  hasVip = (userIsVip || isAdmin);
                  membershipType = hasVip ? userMembership : null;
                }

                // Force Dody's permanent prestige override
                if (msgIsManager) {
                  hasVip = true;
                  membershipType = 'famous';
                }

                if (msg.uid === 'system_announcement') {
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex justify-center p-4"
                    >
                      <div className="bg-amber-500/5 border border-amber-500/20 px-8 py-3 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.1)] text-center">
                        <span className="text-[16px] font-black gold-gradient-text uppercase tracking-widest leading-loose">
                          <span>{msg.text} 👑</span>
                        </span>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2 group/msg`}
                  >
                    <div className={`flex flex-col gap-1 max-w-[85%] ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-1.5 ${isMe ? 'ml-auto mr-2 flex-row-reverse' : 'mr-auto ml-2'}`}>
                        <span className={`${msgIsManager ? 'text-amber-500' : 'text-indigo-400'} text-[13px] font-bold`}>
                          <span>{msgIsManager ? (msg.displayName || 'دودي-Dody 👑') : msg.displayName}</span>
                        </span>
                        {msgIsManager && <Shield className="w-3 h-3 text-amber-500 fill-amber-500/10" />}
                        {membershipType === 'famous' && (
                          <span className="animated-gold-tag text-[12px]"><span>#المشهور</span></span>
                        )}
                        {membershipType === 'influencer' && (
                          <span className="text-green-400 text-[11px] font-bold"><span>#المؤثر</span></span>
                        )}
                        {membershipType === 'premium' && (
                          <span className="text-orange-400 text-[11px] font-bold"><span>#المميز</span></span>
                        )}
                        {msgIsManager && (
                          <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-black"><span>ADMIN</span></span>
                        )}
                      </div>
                      
                      <div className="relative group flex items-end gap-2">
                        {!isMe && (
                          <div className="flex flex-col gap-1 items-center">
                            <button 
                              onClick={() => isAdmin ? setAdminTargetUser(msg) : onOpenDM?.({ uid: msg.uid, displayName: msg.displayName, photoURL: msg.photoURL, username: (msg as any).username })}
                              className="relative active:scale-95 transition-transform shrink-0"
                            >
                              <img 
                                src={msg.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.displayName || 'User'}`} 
                                className={`w-9 h-9 rounded-full border object-cover ${msgIsManager ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-white/10'} ${isAdmin ? 'ring-2 ring-amber-500/30' : ''}`}
                                alt="avatar"
                              />
                              {msgIsManager && <Crown className="absolute -top-1 -right-1 w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                            </button>
                            <button 
                              onClick={() => onOpenDM?.({ uid: msg.uid, displayName: msg.displayName, photoURL: msg.photoURL, username: (msg as any).username })}
                              className="bg-indigo-600/20 p-1 rounded-lg text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all active:scale-90"
                              title="مراسلة خاصة"
                            >
                              <MessageSquare className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <div 
                          className={`
                            px-4 py-2.5 rounded-[1.2rem] relative text-[15px] leading-relaxed transition-all shadow-xl
                            ${msgIsManager 
                                ? 'bg-[#1a160a] text-amber-100 rounded-br-none border border-amber-500/20 font-bold' 
                                : isMe 
                                  ? 'bg-[#0c1425] text-white rounded-bl-none border border-indigo-500/20' 
                                  : 'bg-[#0f172a] text-gray-200 rounded-br-none border border-white/5'
                            }
                            ${membershipType === 'premium' ? 'neon-gold-glow !bg-[#1a1005] !border-[#ff9900]/20' : ''}
                            ${membershipType === 'influencer' ? 'neon-green-glow !bg-[#051a0a] !border-[#39ff14]/20' : ''}
                            ${membershipType === 'famous' ? 'neon-red-glow !bg-[#0a0505] !border-[#ff0000]/30 font-bold' : ''}
                          `}
                        >
                          <p className="whitespace-pre-wrap"><span>{msg.text}</span></p>
                        </div>

                        {isMe && (
                          <div className="relative shrink-0">
                            <img 
                              src={msg.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.displayName || 'User'}`} 
                              className={`w-9 h-9 rounded-full border object-cover ${isAdmin ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-indigo-500/30'}`}
                              alt="avatar"
                            />
                            {isAdmin && <Crown className="absolute -top-1 -left-1 w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                          </div>
                        )}

                        {(isMe || isAdmin) && (
                          <button 
                            onClick={() => handleDeleteMessage(msg.id)}
                            className={`
                              absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all p-1.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white
                              ${isMe ? '-right-10' : '-left-10'}
                            `}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Input Section */}
      <div className="p-4 bg-gradient-to-t from-[#05070a] to-transparent pb-8">
        {isMuted ? (
          <div className="max-w-2xl mx-auto p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center text-red-500 font-black text-sm animate-pulse">
            أنت مكتوم حالياً بواسطة الإدارة الملكية ⚠️
          </div>
        ) : (
          <form 
            onSubmit={handleSendMessage} 
            className="max-w-2xl mx-auto flex items-center gap-2 p-1.5 bg-[#0a0f18]/80 border border-white/5 rounded-2xl shadow-2xl backdrop-blur-xl"
          >
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="اكتب رسالتك الملكية..."
              className="flex-1 bg-transparent border-none outline-none text-sm px-3 placeholder:text-gray-600 font-bold"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* User Profile Modal */}
      <AnimatePresence>
        {adminTargetUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setAdminTargetUser(null)}
               className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 w-full max-w-xs relative z-10 shadow-2xl"
            >
              <div className="text-center mb-6">
                <img 
                  src={adminTargetUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${adminTargetUser.displayName}`} 
                  className="w-20 h-20 rounded-2xl mx-auto border-2 border-indigo-500 shadow-xl mb-3 object-cover"
                  alt="target"
                />
                <h3 className="text-lg font-bold text-white">{adminTargetUser.displayName}</h3>
                <p className="text-[10px] text-indigo-400 font-black mt-1 opacity-90 flex items-center justify-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 shadow-md uppercase">
                  <Shield className="w-3 h-3 text-indigo-400" />
                  {adminTargetUser.username ? `@${adminTargetUser.username}` : 'عضو ملكي'}
                </p>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={() => {
                    onOpenDM?.({ uid: adminTargetUser.uid, displayName: adminTargetUser.displayName, photoURL: adminTargetUser.photoURL, username: adminTargetUser.username });
                    setAdminTargetUser(null);
                  }}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all font-black text-sm shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>مراسلة خاصة ✉️</span>
                </button>

                {isAdmin && (
                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <div className="text-[10px] text-amber-500/50 font-black uppercase tracking-[0.2em] text-center mb-2">الأوامر الملكية</div>
                    
                    {successAction && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center text-[10px] text-green-400 font-bold"
                      >
                        تم تنفيذ الأمر الملكي بنجاح ✅
                      </motion.div>
                    )}

                    {!successAction && (
                      <div className="grid grid-cols-1 gap-2">
                        <button 
                          onClick={() => grantMembership('famous')}
                          className="w-full group flex items-center justify-between py-3 px-4 bg-red-500/5 hover:bg-red-500/20 text-red-400 border border-red-500/10 hover:border-red-500/40 rounded-xl transition-all active:scale-95"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg group-hover:scale-125 transition-transform">👑</span>
                            <span className="text-[11px] font-black uppercase">منح مشهور</span>
                          </div>
                        </button>

                        <button 
                          onClick={() => grantMembership('influencer')}
                          className="w-full group flex items-center justify-between py-3 px-4 bg-green-500/5 hover:bg-green-500/20 text-green-400 border border-green-500/10 hover:border-green-500/40 rounded-xl transition-all active:scale-95"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg group-hover:scale-125 transition-transform">✨</span>
                            <span className="text-[11px] font-black uppercase">منح مؤثر</span>
                          </div>
                        </button>

                        <button 
                          onClick={() => grantMembership('premium')}
                          className="w-full group flex items-center justify-between py-3 px-4 bg-orange-500/5 hover:bg-orange-500/20 text-orange-400 border border-orange-500/10 hover:border-orange-500/40 rounded-xl transition-all active:scale-95"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg group-hover:scale-125 transition-transform">⭐</span>
                            <span className="text-[11px] font-black uppercase">منح مميز</span>
                          </div>
                        </button>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button 
                            onClick={toggleMute}
                            className="flex items-center justify-center gap-2 py-3 bg-gray-500/5 hover:bg-gray-500/20 text-gray-400 border border-gray-500/10 rounded-xl transition-all active:scale-95 text-[10px] font-black"
                          >
                            <VolumeX className="w-3 h-3" />
                            <span>كتم</span>
                          </button>
                          <button 
                            onClick={handleKick}
                            className="flex items-center justify-center gap-2 py-3 bg-rose-500/5 hover:bg-rose-500/20 text-rose-500 border border-rose-500/10 rounded-xl transition-all active:scale-95 text-[10px] font-black"
                          >
                            <Ban className="w-3 h-3" />
                            <span>طرد</span>
                          </button>
                        </div>

                        <button 
                          onClick={() => grantMembership(null)}
                          className="w-full py-2 text-[9px] text-gray-600 hover:text-gray-400 transition-colors font-black uppercase tracking-widest text-center mt-2"
                        >
                          سحب كافة الصلاحيات ⚠️
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

