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
  const [joinTime] = useState(() => Date.now()); // وقت دخول المستخدم الحالي
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
    const messagesRef = ref(rtdb, `rooms/${room}/messages`);
    
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgList = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        })) as Message[];
        
        msgList.sort((a, b) => {
          const tA = a.timestamp || Date.now();
          const tB = b.timestamp || Date.now();
          return tA - tB;
        });
        
        // تطبيق فلتر وقت الدخول: فقط الرسائل التي أُرسلت بعد دخول المستخدم
        const recentMessages = msgList.filter(m => {
          const mTime = m.timestamp || Date.now();
          return mTime >= joinTime;
        });

        setMessages(recentMessages.filter(m => {
          if (m.uid === 'system_announcement') return true;
          const hasProfile = profilesCache[m.uid] || data[m.id];
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
  }, [room, joinTime]); // تمت إضافة joinTime كاعتمادية لضمان الدقة

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
      let membership = userMembership;
      if (auth.currentUser.email === 'lm656508@gmail.com') {
        if (!membership) membership = 'famous';
      }

      const messagesRef = ref(rtdb, `rooms/${room}/messages`);
      const newMessageRef = push(messagesRef);
      const isDev = auth.currentUser.email === 'lm656508@gmail.com';
      
      const payload = {
        text,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        displayName: userData?.displayName || (isDev ? 'دودي-Dody 👑' : (auth.currentUser.displayName || 'Unknown')),
        photoURL: userData?.photoURL || auth.currentUser.photoURL || '',
        timestamp: rtdbTimestamp(),
        membership: userMembership,
        isVip: userIsVip || isDev,
        isManager: isDev,
        username: isDev ? 'aa' : (username || null)
      };

      await set(newMessageRef, payload);
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
    }
  };

  const isAdmin = auth.currentUser?.email === 'lm656508@gmail.com';

  const grantMembership = async (type: 'premium' | 'influencer' | 'famous' | null) => {
    if (!adminTargetUser || !auth.currentUser) return;
    const targetUserId = adminTargetUser.uid;

    const userRef = ref(rtdb, `users/${targetUserId}`);
    update(userRef, {
      isVip: type !== null,
      membership: type,
    }).then(async () => {
      setSuccessAction(type || 'remove');
      await setDoc(doc(db, 'users', targetUserId), { isVip: type !== null, membership: type }, { merge: true });

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
      
      await setDoc(userRef, { isMuted: newMuteStatus }, { merge: true });
      await update(ref(rtdb, 'users/' + targetUserId), { isMuted: newMuteStatus });
      
      setSuccessAction('mute');
      setTimeout(() => { setAdminTargetUser(null); setSuccessAction(null); }, 1500);
    } catch (err) { alert("فشل التحكم بالكتم"); }
  };

  const handleKick = async () => {
    if (!adminTargetUser) return;
    if (!confirm('هل أنت متأكد من طرد هذا المستخدم نهائياً؟')) return;
    try {
      const targetUserId = adminTargetUser.uid;
      await setDoc(doc(db, 'users', targetUserId), { isBanned: true }, { merge: true });
      await update(ref(rtdb, 'users/' + targetUserId), { isBanned: true });
      setSuccessAction('kick');
      setTimeout(() => { setAdminTargetUser(null); setSuccessAction(null); }, 1500);
    } catch (err) { alert('فشل عملية الطرد'); }
  };

  return (
    <div className="flex flex-col h-screen bg-[#05070a] text-white font-arabic" dir="rtl">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-6 border-b border-white/5 bg-[#0a0f18]/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-indigo-600/20 rounded-full transition-all text-indigo-400 group active:scale-90">
            <ChevronLeft className="w-5 h-5 rotate-180 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <div className="flex flex-col items-start">
            <span className="text-sophisticated-gold text-[9px] font-black tracking-[0.2em] uppercase opacity-70 mb-0.5">شاتنا - CHATNA</span>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black gold-gradient-text"><span>قاعة {roomName}</span></h2>
              {isAdmin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
            </div>
          </div>
        </div>
        <button onClick={() => auth.signOut()} className="w-10 h-10 flex items-center justify-center bg-red-500/5 hover:bg-red-500/20 border border-red-500/10 rounded-xl transition-all text-red-400 active:scale-95">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8 space-y-6 scroll-smooth relative">
        <AnimatePresence>
          {showRoyalEntry && (
            <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className="fixed top-24 left-4 right-4 z-[60] flex justify-center pointer-events-none">
              <div className="bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 p-[1px] rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.4)] pointer-events-auto">
                <div className="bg-[#0a0f18] px-6 py-2.5 rounded-2xl flex items-center gap-3">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <span className="text-[12px] font-black gold-gradient-text uppercase">👑 تم دخول المطور دودي-Dody إلى الغرفة الآن</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full" />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isMe = msg.uid === auth.currentUser?.uid;
                const msgIsManager = (msg as any).isManager === true;
                const liveProfile = profilesCache[msg.uid] || {};
                let membershipType = liveProfile.membership || msg.membership;
                
                if (msg.uid === 'system_announcement') {
                  return (
                    <div key={msg.id} className="flex justify-center p-4">
                      <div className="bg-amber-500/5 border border-amber-500/20 px-8 py-3 rounded-full text-center">
                        <span className="gold-gradient-text font-black">{msg.text} 👑</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2 group/msg`}>
                    <div className={`flex flex-col gap-1 max-w-[85%] ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className={`${msgIsManager ? 'text-amber-500' : 'text-indigo-400'} text-[13px] font-bold`}>{msg.displayName}</span>
                        {membershipType === 'famous' && <span className="animated-gold-tag text-[12px]">#المشهور</span>}
                      </div>
                      <div className={`px-4 py-2.5 rounded-[1.2rem] ${isMe ? 'bg-[#0c1425] border-indigo-500/20' : 'bg-[#0f172a] border-white/5'} border text-[15px]`}>
                        <p>{msg.text}</p>
                      </div>
                      {(isMe || isAdmin) && (
                        <button onClick={() => handleDeleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-all text-red-500 hover:text-red-400 mt-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-4 bg-gradient-to-t from-[#05070a] to-transparent pb-8">
        {!isMuted ? (
          <form onSubmit={handleSendMessage} className="max-w-2xl mx-auto flex items-center gap-2 p-1.5 bg-[#0a0f18]/80 border border-white/5 rounded-2xl">
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="اكتب رسالتك الملكية..." className="flex-1 bg-transparent px-3 outline-none text-sm font-bold" />
            <button type="submit" disabled={!inputText.trim()} className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-lg shadow-indigo-600/20"><Send className="w-4 h-4" /></button>
          </form>
        ) : (
          <div className="text-center text-red-500 font-black text-sm">أنت مكتوم حالياً بواسطة الإدارة ⚠️</div>
        )}
      </div>

      {/* Admin Target Modal (Simplified) */}
      <AnimatePresence>
        {adminTargetUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAdminTargetUser(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 w-full max-w-xs relative z-10">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold">{adminTargetUser.displayName}</h3>
                </div>
                <div className="space-y-2">
                  <button onClick={() => { onOpenDM?.(adminTargetUser); setAdminTargetUser(null); }} className="w-full py-3 bg-indigo-600 rounded-xl font-bold">مراسلة خاصة ✉️</button>
                  {isAdmin && (
                    <>
                      <button onClick={() => grantMembership('famous')} className="w-full py-2 bg-amber-500/10 text-amber-500 rounded-lg">منح مشهور</button>
                      <button onClick={toggleMute} className="w-full py-2 bg-gray-500/10 text-gray-400 rounded-lg">كتم/إلغاء</button>
                      <button onClick={handleKick} className="w-full py-2 bg-red-500/10 text-red-500 rounded-lg">طرد</button>
                    </>
                  )}
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
