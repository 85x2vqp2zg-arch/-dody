import React, { useState, useEffect, useRef } from 'react';
import { ref, push, onValue, set, update, serverTimestamp, query, limitToLast, remove } from 'firebase/database';
import { auth, rtdb, db } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Send, ChevronLeft, MoreVertical, Ban, Trash2, Shield, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DMMessage {
  id: string;
  text?: string;
  uid: string;
  displayName?: string;
  photoURL?: string;
  membership?: string;
  isVip?: boolean;
  timestamp: any;
  pending?: boolean;
}

export default function PrivateChat({ targetUser: initialTargetUser, onBack, initialMessage, userData: initialUserData }: { targetUser: { uid: string, displayName: string, photoURL: string, username?: string }, onBack: () => void, initialMessage?: string, userData?: any }) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [targetUser, setTargetUser] = useState(initialTargetUser);
  const [myLiveStatus, setMyLiveStatus] = useState<any>(initialUserData);
  const [targetLiveStatus, setTargetLiveStatus] = useState<any>(null);
  const [inputText, setInputText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [amIBlocked, setAmIBlocked] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  const [showGrantMenu, setShowGrantMenu] = useState(false);
  const [isGranting, setIsGranting] = useState<string | null>(null); // 'famous', 'influencer', 'premium' or null
  const [grantSuccess, setGrantSuccess] = useState(false);
  
  const isDev = auth.currentUser?.email === 'lm656508@gmail.com';

  const grantRank = async (type: 'famous' | 'influencer' | 'premium') => {
    const targetUid = targetUser.uid;
    // Fast Optimistic Update
    setTargetLiveStatus((prev: any) => ({ ...prev, isVip: true, membership: type }));

    // Use requested direct update pattern
    const userRef = ref(rtdb, `users/${targetUid}`);
    update(userRef, {
      isVip: true,
      membership: type,
    }).then(async () => {
      setGrantSuccess(true);
      // Optional: Update Firestore for persistence as backup
      await setDoc(doc(db, 'users', targetUid), { isVip: true, membership: type, updatedAt: new Date().toISOString() }, { merge: true });
      // alert('تم منح الرتبة بنجاح ✅'); // Removing blocking alert as per "إزالة التأخير" vs "تنبيه سريع"
      setTimeout(() => {
        setGrantSuccess(false);
        setShowGrantMenu(false);
      }, 1500);
    }).catch((error) => {
      alert('خطأ في الربط: ' + error.message);
      // Rollback optimistic
      setTargetLiveStatus(null); 
    });
  };

  const isAdmin = auth.currentUser?.email === 'lm656508@gmail.com';
  const realAdminUid = window.localStorage.getItem('admin_uid_cache') || (window as any).OFFICIAL_ADMIN_UID;
  const isTargetAdmin = targetUser.username === 'aa' || targetUser.uid === 'dev_admin_account_lm656508' || (targetUser as any).email === 'lm656508@gmail.com' || targetUser.uid === realAdminUid;
  
  let chatId = [auth.currentUser?.uid, targetUser.uid].sort().join('_');
  const targetIdForMetadata = isTargetAdmin && realAdminUid ? realAdminUid : targetUser.uid;

  if ((isAdmin || isTargetAdmin) && auth.currentUser) {
    const regularUserUid = isAdmin ? targetUser.uid : auth.currentUser.uid;
    chatId = `admin_chats/${regularUserUid}`;
  }

  useEffect(() => {
    // Listen to target user's current RTDB status for instant sync
    const targetRef = ref(rtdb, `users/${targetIdForMetadata}`);
    const unsubTarget = onValue(targetRef, (snap) => {
      const data = snap.val();
      if (data) {
        setTargetLiveStatus(data);
        setTargetUser(prev => ({ ...prev, ...data, uid: targetIdForMetadata }));
      }
    });

    // Listen to my own RTDB status for instant sync
    if (auth.currentUser) {
      const myRef = ref(rtdb, `users/${auth.currentUser.uid}`);
      onValue(myRef, (snap) => {
        const data = snap.val();
        if (data) setMyLiveStatus(data);
      }, { onlyOnce: false });
    }

    return () => unsubTarget();
  }, [targetIdForMetadata]);

  useEffect(() => {
    // Check if I blocked them
    if (!auth.currentUser) return;
    const blockedByMeRef = ref(rtdb, `blocks/${auth.currentUser.uid}/${targetUser.uid}`);
    const unsubBlockMe = onValue(blockedByMeRef, (snap) => setIsBlockedByMe(!!snap.val()));

    // Check if they blocked me
    const amIBlockedRef = ref(rtdb, `blocks/${targetUser.uid}/${auth.currentUser.uid}`);
    const unsubAmIBlocked = onValue(amIBlockedRef, (snap) => setAmIBlocked(!!snap.val()));

    // Fast loading last 50 messages
    const dmPath = chatId.includes('/') ? chatId : `private_messages/${chatId}`;
    const dmRef = query(ref(rtdb, dmPath), limitToLast(50));
    const unsubscribeMessages = onValue(dmRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) as DMMessage[];
        list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setMessages(list);
      } else {
        setMessages([]);
      }
    });

    // Mark as read when opening and while open
    const myMetaRef = ref(rtdb, `user_dms/${auth.currentUser.uid}/${targetIdForMetadata}`);
    const unsubUnread = onValue(myMetaRef, (snap) => {
      const data = snap.val();
      if (data && data.unreadCount > 0) {
        set(myMetaRef, { ...data, unreadCount: 0 });
      }
    });

    return () => {
      unsubscribeMessages();
      unsubBlockMe();
      unsubAmIBlocked();
      unsubUnread();
    };
  }, [chatId]);

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isBlockedByMe || amIBlocked || !auth.currentUser || isSending || myLiveStatus?.isMuted) return;
    
    setInputText(''); 
    setIsSending(true);

    // Optimistic UI update
    const optimisticId = `opt_${Date.now()}`;
    const optimisticMsg: any = {
      id: optimisticId,
      text,
      uid: auth.currentUser.uid,
      displayName: myLiveStatus?.displayName || auth.currentUser.displayName || 'عضو ملكي',
      photoURL: myLiveStatus?.photoURL || auth.currentUser.photoURL || '',
      timestamp: Date.now(),
      pending: true
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const dmPath = chatId.includes('/') ? chatId : `private_messages/${chatId}`;
      const dmRef = ref(rtdb, dmPath);
      const newMessageRef = push(dmRef);
      const timestamp = serverTimestamp();
      const isDev = auth.currentUser.email === 'lm656508@gmail.com';
      
      const payload = {
        text,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        displayName: myLiveStatus?.displayName || auth.currentUser.displayName || (isDev ? 'دودي-Dody 👑' : 'عضو ملكي'),
        photoURL: myLiveStatus?.photoURL || auth.currentUser.photoURL || (isDev ? `https://api.dicebear.com/7.x/initials/svg?seed=Dody` : `https://api.dicebear.com/7.x/initials/svg?seed=${auth.currentUser.displayName || 'User'}`),
        membership: myLiveStatus?.membership || (isDev ? 'famous' : null),
        isVip: myLiveStatus?.isVip || isDev,
        isManager: isDev,
        username: isDev ? 'aa' : (myLiveStatus?.username || null),
        timestamp
      };

      await set(newMessageRef, payload);

      // Update metadata for conversation list
      const metaRef = ref(rtdb, `user_dms/${auth.currentUser.uid}/${targetIdForMetadata}`);
      const targetMetaRef = ref(rtdb, `user_dms/${targetIdForMetadata}/${auth.currentUser.uid}`);
      
      const metaData = {
        uid: targetIdForMetadata,
        displayName: targetLiveStatus?.displayName || targetUser.displayName || (isTargetAdmin ? 'المطور دودي-Dody 👑' : 'عضو ملكي'),
        photoURL: targetLiveStatus?.photoURL || targetUser.photoURL || (isTargetAdmin ? `https://api.dicebear.com/7.x/initials/svg?seed=Dody` : ''),
        lastMessage: text,
        username: isTargetAdmin ? 'aa' : (targetLiveStatus?.username || targetUser.username || null),
        timestamp
      };

      const targetMetaData = {
        uid: auth.currentUser.uid,
        displayName: myLiveStatus?.displayName || auth.currentUser.displayName || (isDev ? 'دودي-Dody 👑' : 'عضو ملكي'),
        photoURL: myLiveStatus?.photoURL || auth.currentUser.photoURL || (isDev ? `https://api.dicebear.com/7.x/initials/svg?seed=Dody` : ''),
        lastMessage: text,
        username: isDev ? 'aa' : (myLiveStatus?.username || null),
        timestamp
      };

      // Update my own metadata too
      update(metaRef, metaData);
      
      // Unread increment and metadata update
      onValue(targetMetaRef, (snap) => {
        const existing = snap.val() || {};
        const newCount = (existing.unreadCount || 0) + 1;
        update(targetMetaRef, {
          ...targetMetaData,
          unreadCount: newCount
        });
      }, { onlyOnce: true });
      
      // Update my own metadata too
      update(metaRef, metaData);
    } catch (err: any) {
      console.error("Private message error:", err.message || err);
      // Rollback optimistic update on error if needed, for simplicity we just let RTDB update eventually
    } finally {
      setIsSending(false);
    }
  };

  const handleBlock = async () => {
    if (!auth.currentUser) return;
    const blockRef = ref(rtdb, `blocks/${auth.currentUser.uid}/${targetUser.uid}`);
    if (isBlockedByMe) {
      await remove(blockRef);
      alert('تم إلغاء الحظر');
    } else {
      await set(blockRef, true);
      alert('تم حظر المستخدم بنجاح');
    }
    setShowMenu(false);
  };

  const handleDeleteChat = async () => {
    if (!auth.currentUser) return;
    if (confirm('هل أنت متأكد من حذف هذه المحادثة بالكامل؟ سيتم مسح الرسائل من الطرفين.')) {
      // Delete the actual messages nodes
      const dmPath = chatId.includes('/') ? chatId : `private_messages/${chatId}`;
      await remove(ref(rtdb, dmPath));
      await remove(ref(rtdb, `chats/${chatId}`));
      
      // Delete user's metadata for this conversation
      const metaRef = ref(rtdb, `user_dms/${auth.currentUser.uid}/${targetUser.uid}`);
      await remove(metaRef);
      
      onBack();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[#05070a] flex flex-col font-arabic" dir="rtl">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-4 border-b border-white/5 bg-[#0a0f18]/80 backdrop-blur-xl relative z-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full">
            <ChevronLeft className="w-5 h-5 rotate-180" />
          </button>
              <div className="flex items-center gap-2">
                <img src={isTargetAdmin ? `https://api.dicebear.com/7.x/initials/svg?seed=Dody` : (targetUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${targetUser.displayName || 'User'}`)} className="w-9 h-9 rounded-full border border-white/10" alt="target" />
                <div>
                  <span className="text-sophisticated-gold text-[7px] font-black tracking-[0.2em] uppercase opacity-70 block mb-0.5">
                    <span>شاتنا - CHATNA</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold"><span>{targetLiveStatus?.displayName || targetUser.displayName || (isTargetAdmin ? 'دودي-Dody 👑' : 'عضو ملكي')}</span></h3>
                    {(targetUser.username || isTargetAdmin) && (
                      <span className="text-[10px] text-amber-500 font-black bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shadow-sm animate-pulse uppercase">
                        <span>@{targetLiveStatus?.username || targetUser.username || (isTargetAdmin ? 'AA' : 'user')}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] text-green-500 font-bold"><span>نشط الآن</span></p>
                  </div>
                </div>
              </div>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-white/5 rounded-full"
          >
            <MoreVertical className="w-5 h-5 text-gray-500" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute left-0 mt-2 w-48 bg-[#0a0f18]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                >
                  <button 
                    onClick={handleBlock}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-right ${isBlockedByMe ? 'text-green-500 hover:bg-green-500/10' : 'text-red-500 hover:bg-red-500/10'}`}
                  >
                    <Ban className="w-4 h-4" />
                    <span className="text-xs font-bold font-black">{isBlockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم'}</span>
                  </button>
                  <button 
                    onClick={handleDeleteChat}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-white/5 transition-colors text-right"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs font-bold font-black">حذف المحادثة</span>
                  </button>
                  <div className="border-t border-white/5 p-3">
                    <div className="flex items-center gap-2 opacity-50">
                      <Shield className="w-3 h-3 text-indigo-400" />
                      <span className="text-[10px] font-black uppercase tracking-tighter text-indigo-400">Dodi Privacy</span>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-[#0a0f18] to-[#05070a]">
        {messages.map((msg) => {
          const isMe = msg.uid === auth.currentUser?.uid;
          const msgIsManager = msg.uid === realAdminUid || (msg as any).userDisplayId === '11111' || (msg as any).isManager === true;
          
          // Use real-time reactive status
          let hasVip = msg.isVip || msgIsManager;
          let membershipType = hasVip ? (msg.membership || (msgIsManager ? 'famous' : null)) : null;

          if (isMe && myLiveStatus) {
             hasVip = myLiveStatus.isVip || msgIsManager;
             membershipType = hasVip ? myLiveStatus.membership : null;
          }
          
          if (!isMe && targetLiveStatus && msg.uid === targetIdForMetadata) {
            hasVip = targetLiveStatus.isVip;
            membershipType = hasVip ? targetLiveStatus.membership : null;
          }

          // Force Dody prestige override
          if (msgIsManager) {
            hasVip = true;
            membershipType = 'famous';
          }

          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {!isMe && (
                <div className="relative group shrink-0">
                  <img 
                    src={msg.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.displayName}`} 
                    className={`w-9 h-9 rounded-full border shrink-0 ${msgIsManager ? 'border-amber-500 shadow-md ring-2 ring-amber-500/20' : 'border-white/10'}`} 
                    alt="avatar" 
                  />
                  {msgIsManager && (
                    <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[#05070a]">
                      <Crown className="w-2 h-2 text-[#05070a]" />
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-[80%]">
                <div className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <span className={`text-[13px] font-bold ${msgIsManager ? 'text-amber-500' : 'text-gray-400'}`}>
                    <span>{msgIsManager ? (msg.displayName || 'دودي-Dody 👑') : msg.displayName}</span>
                  </span>
                  {msgIsManager && <Shield className="w-2.5 h-2.5 text-amber-500 fill-amber-500/10" />}
                  {membershipType === 'famous' && <span className="animated-gold-tag text-[11px] px-1 shadow-md ring-1 ring-amber-500/30"><span>#المشهور</span></span>}
                  {membershipType === 'influencer' && <span className="text-green-400 text-[10px] px-1 font-bold"><span>#المؤثر</span></span>}
                  {membershipType === 'premium' && <span className="text-orange-400 text-[10px] px-1 font-bold"><span>#المميز</span></span>}
                </div>
                <div className={`p-2.5 px-4 rounded-[1.2rem] shadow-xl border ${
                  msgIsManager
                    ? 'bg-[#1a160a] border-amber-500/20 text-amber-100 rounded-br-sm font-bold'
                    : isMe 
                      ? 'bg-indigo-600 border-indigo-500/30 text-white rounded-bl-sm' 
                      : 'bg-[#1e293b] border-white/5 text-gray-200 rounded-br-sm'
                } 
                ${membershipType === 'famous' ? 'neon-red-glow !bg-[#0a0505] !border-[#ff0000]/20 font-bold' : ''}
                ${membershipType === 'influencer' ? 'neon-green-glow !bg-[#051a0a] !border-[#39ff14]/20' : ''}
                ${membershipType === 'premium' ? 'neon-gold-glow !bg-[#1a1005] !border-[#ff9900]/20' : ''}
                ${msg.pending ? 'opacity-70 italic' : ''}`}>
                  <p className="text-[15px] leading-relaxed"><span>{msg.text}</span></p>
                </div>
              </div>
              {isMe && (
                <img 
                  src={msg.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.displayName}`} 
                  className="w-9 h-9 rounded-full border border-white/10 shrink-0" 
                  alt="avatar" 
                />
              )}
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-[#0a0f18]">
        {myLiveStatus?.isMuted ? (
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl text-center animate-pulse">
            <p className="text-xs text-red-500 font-bold">
              أنت مكتوم حالياً بواسطة الإدارة الملكية ⚠️
            </p>
          </div>
        ) : isBlockedByMe || amIBlocked ? (
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl text-center">
            <p className="text-xs text-red-500 font-bold">
              {amIBlocked ? 'لقد قام هذا المستخدم بحظرك' : 'لقد قمت بحظر هذا المستخدم'}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[#05070a] border border-white/5 rounded-2xl p-1.5 focus-within:border-indigo-500/50 transition-all relative">
            {isDev && (
              <div className="relative">
                <button 
                  onClick={() => setShowGrantMenu(!showGrantMenu)}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${showGrantMenu ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 hover:scale-105'} active:scale-90`}
                  title="منح رتبة ملكية"
                >
                  <Crown className="w-5 h-5" />
                </button>

                <AnimatePresence>
                  {showGrantMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10, scale: 0.9 }}
                      animate={{ opacity: 1, y: -150, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.9 }}
                      className="absolute bottom-full right-0 mb-4 bg-[#0f172a] border border-amber-500/30 rounded-[1.5rem] p-3 flex flex-col gap-2 shadow-2xl z-[100] min-w-[150px] backdrop-blur-3xl"
                    >
                      {grantSuccess ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="py-6 flex flex-col items-center justify-center gap-3 bg-green-500/5 rounded-2xl border border-green-500/20"
                        >
                          <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-bounce text-2xl">
                            ✅
                          </div>
                          <span className="text-xs text-green-400 font-bold tracking-tighter">تم المنح بنجاح! 👑</span>
                        </motion.div>
                      ) : (
                        <>
                          <div className="text-[10px] text-amber-500/50 font-black px-2 mb-2 uppercase tracking-[0.2em] text-center">الرتب الملكية</div>
                          <button 
                            onClick={() => grantRank('famous')}
                            disabled={!!isGranting}
                            className="w-full group flex items-center justify-between py-3 px-4 bg-red-500/5 hover:bg-red-500/20 text-red-400 border border-red-500/10 hover:border-red-500/40 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg group-hover:scale-125 transition-transform">👑</span>
                              <span className="text-[11px] font-black uppercase">منح مشهور</span>
                            </div>
                            {isGranting === 'famous' && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 border-2 border-t-transparent border-red-400 rounded-full" />}
                          </button>

                          <button 
                            onClick={() => grantRank('influencer')}
                            disabled={!!isGranting}
                            className="w-full group flex items-center justify-between py-3 px-4 bg-green-500/5 hover:bg-green-500/20 text-green-400 border border-green-500/10 hover:border-green-500/40 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg group-hover:scale-125 transition-transform">✨</span>
                              <span className="text-[11px] font-black uppercase">منح مؤثر</span>
                            </div>
                            {isGranting === 'influencer' && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 border-2 border-t-transparent border-green-400 rounded-full" />}
                          </button>

                          <button 
                            onClick={() => grantRank('premium')}
                            disabled={!!isGranting}
                            className="w-full group flex items-center justify-between py-3 px-4 bg-orange-500/5 hover:bg-orange-500/20 text-orange-400 border border-orange-500/10 hover:border-orange-500/40 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg group-hover:scale-125 transition-transform">⭐</span>
                              <span className="text-[11px] font-black uppercase">منح مميز</span>
                            </div>
                            {isGranting === 'premium' && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 border-2 border-t-transparent border-orange-400 rounded-full" />}
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (sendMessage(inputText), setInputText(''))}
              placeholder="اكتب رسالة خاصة..."
              className="flex-1 bg-transparent border-none outline-none text-sm px-4 h-11"
            />
            
            <button 
              onClick={() => { sendMessage(inputText); setInputText(''); }}
              disabled={!inputText.trim()}
              className="w-11 h-11 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 disabled:bg-gray-800 disabled:text-gray-500 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
