/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User, updateProfile, sendEmailVerification } from 'firebase/auth';
import { auth, db, storage, rtdb } from './firebase';
import { doc, setDoc, onSnapshot, collection, query, where, getDocs, deleteDoc, getDocFromServer } from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Login from './components/Login';
import ChatRoom from './components/ChatRoom';
import PrivateChat from './components/PrivateChat';
import { Crown, LayoutGrid, Users, Settings, LogOut, ChevronLeft, Sparkles, ShieldCheck, Camera, Check, Edit2, MessageSquare, Bell, Search, User as UserIcon, Mail, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ref, onValue, update, set, push, increment } from 'firebase/database';

const ADMIN_EMAIL = 'lm656508@gmail.com';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [dmInitialMessage, setDmInitialMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rooms' | 'store' | 'profile' | 'dms'>('rooms');
  const [isFirstLogin, setIsFirstLogin] = useState(true);
  const [dmTarget, setDmTarget] = useState<any>(null);
  const [dmConversations, setDmConversations] = useState<any[]>([]);
  const [hasNewDMs, setHasNewDMs] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState('');
  const [searchUsername, setSearchUsername] = useState('');
  const [foundUser, setFoundUser] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [adminUid, setAdminUid] = useState<string>(window.localStorage.getItem('admin_uid_cache') || "");
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    // Test Firestore connection on boot
    const testConnection = async () => {
      try {
        const snap = await getDocFromServer(doc(db, 'system', 'health')).catch(err => {
          if (err.code === 'unavailable' || err.message.includes('offline')) {
             console.warn("Firestore is currently offline or unreachable. Retrying in background...");
             return null;
          }
          throw err;
        });
        
        if (snap) {
          console.log("Firestore connection healthy! ✅");
        }
      } catch (err: any) {
        console.error("Firestore connection probe failed:", err.message || err);
      }
    };
    testConnection();

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Sync verification status to Firestore
        const userRef = doc(db, 'users', u.uid);
        const isGoogleUser = u.providerData.some(p => p.providerId === 'google.com');
        const verified = u.emailVerified || isGoogleUser || u.email === ADMIN_EMAIL;
        
        await setDoc(userRef, { 
          emailVerified: verified,
          lastSeen: new Date().toISOString()
        }, { merge: true });

        // Update RTDB presence as well
        const statusRef = ref(rtdb, `users/${u.uid}`);
        update(statusRef, { 
          emailVerified: verified,
          online: true 
        });

        // Ensure loading doesn't hang if user doc is being created or delayed
        const loadingTimer = setTimeout(() => {
          setLoading(false);
        }, 3000);

        return () => clearTimeout(loadingTimer);
      } else {
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });

    // Resolve real Admin UID and Cleanup ghosts/duplicates
    const resolveAdmin = async () => {
      try {
        const qEmail = query(collection(db, 'users'), where('email', '==', ADMIN_EMAIL));
        const snapEmail = await getDocs(qEmail);
        
        let adminDoc = snapEmail.empty ? null : snapEmail.docs[0];
        
        if (adminDoc) {
          const realUid = adminDoc.id;
          setAdminUid(realUid);
          window.localStorage.setItem('admin_uid_cache', realUid);
          (window as any).OFFICIAL_ADMIN_UID = realUid;
          
          // Official Identity Setup
          await setDoc(doc(db, 'users', realUid), { 
            username: 'aa',
            displayName: 'دودي-Dody 👑',
            isVip: true,
            membership: 'famous',
            emailVerified: true
          }, { merge: true });
          
          // Sync to RTDB for live identity
          const adminStatusRef = ref(rtdb, `users/${realUid}`);
          update(adminStatusRef, { 
            isVip: true, 
            membership: 'famous',
            username: 'aa',
            displayName: 'دودي-Dody 👑',
            emailVerified: true
          });

          // PURE PURGE: Find and DELETE ghosts using 'AA' or Dody's name illegally
          const ghostQ = query(collection(db, 'users'), where('username', '==', 'aa'));
          const ghostSnap = await getDocs(ghostQ);
          ghostSnap.forEach(async (d) => {
            if (d.id !== realUid) {
              console.log("Purging ghost AA username:", d.id);
              await deleteDoc(doc(db, 'users', d.id));
              await set(ref(rtdb, `users/${d.id}`), null);
            }
          });

          // PURGE: Unverified accounts older than 24h
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const unverifiedQ = query(collection(db, 'users'), where('emailVerified', '==', false));
          const unverifiedSnap = await getDocs(unverifiedQ);
          unverifiedSnap.forEach(async (d) => {
            const data = d.data();
            if (data.createdAt && data.createdAt < yesterday) {
              console.log("Purging old unverified user:", d.id);
              await deleteDoc(doc(db, 'users', d.id));
              await set(ref(rtdb, `users/${d.id}`), null);
            }
          });

          const nameGhostQ = query(collection(db, 'users'), where('displayName', '==', 'دودي-Dody 👑'));
          const nameGhostSnap = await getDocs(nameGhostQ);
          nameGhostSnap.forEach(async (d) => {
            if (d.id !== realUid && d.data().email !== ADMIN_EMAIL) {
              console.log("Purging ghost name developer:", d.id);
              await deleteDoc(doc(db, 'users', d.id));
              await set(ref(rtdb, `users/${d.id}`), null);
            }
          });
        }
      } catch (e: any) {
        console.error("Admin resolution/cleanup failed", e.message || e);
      }
    };
    resolveAdmin();

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Live RTDB Profile Sync specifically requested for the current user
    const userStatusRef = ref(rtdb, `users/${user.uid}`);
    const unsubRTDB = onValue(userStatusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setUserData((prev: any) => ({ ...prev, ...data }));
        
        if (data.isBanned) {
          auth.signOut();
        }
      }
    });

    const unsubUserData = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData((prev: any) => ({ ...prev, ...data }));
        
        // Redirect first-time login
        if (isFirstLogin) {
          setActiveTab('rooms');
          setActiveRoom('public');
          setIsFirstLogin(false);
        }
        
        // Sync name restrictions
        if (data.displayName === 'دودي-Dody 👑' && user.email !== ADMIN_EMAIL) {
           updateProfile(user, { displayName: `عضو_${Math.floor(Math.random()*1000)}` });
           setDoc(doc(db, 'users', user.uid), { displayName: `عضو_${Math.floor(Math.random()*1000)}` }, { merge: true });
        }
        
        // Ensure username exists (for old accounts)
        if (!data.username) {
          const isDev = user.email === ADMIN_EMAIL;
          const fallbackUsername = isDev ? 'aa' : `u${user.uid.substring(0, 5)}`.toLowerCase();
          setDoc(doc(db, 'users', user.uid), { username: fallbackUsername }, { merge: true });
        }

        // Forced developer recognition - check email strictly
        if (user.email === ADMIN_EMAIL) {
          if (!data.isVip || data.displayName !== 'دودي-Dody 👑' || data.username !== 'aa') {
            const updateDevStatus = async () => {
               const { update, ref: dbRef } = await import('firebase/database');
               const { rtdb } = await import('./firebase');
               await setDoc(doc(db, 'users', user.uid), {
                 isVip: true,
                 membership: 'famous', 
                 displayName: 'دودي-Dody 👑',
                 username: 'aa',
                 emailVerified: true,
                 updatedAt: new Date().toISOString()
               }, { merge: true });
               await update(dbRef(rtdb, `users/${user.uid}`), {
                 isVip: true,
                 membership: 'famous',
                 displayName: 'دودي-Dody 👑',
                 username: 'aa',
                 emailVerified: true
               });
               console.log('تم تنشيط ميزات المالك دودي بنجاح 👑✅');
            };
            updateDevStatus();
          }
        }

        if (data.isBanned) {
          auth.signOut();
        }
      } else if (user.email === ADMIN_EMAIL) {
         // Auto-create admin doc if missing
         setDoc(doc(db, 'users', user.uid), {
           email: ADMIN_EMAIL,
           displayName: 'دودي-Dody 👑',
           username: 'aa',
           isVip: true,
           membership: 'famous',
           emailVerified: true,
           createdAt: new Date().toISOString()
         }, { merge: true });
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore onSnapshot error:", error.message || error);
      setLoading(false);
    });

    return () => {
      unsubRTDB();
      unsubUserData();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Listen for DM conversations
    const dmsRef = ref(rtdb, `user_dms/${user.uid}`);
    const unsubDMs = onValue(dmsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data).sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)) as any[];
        setDmConversations(list);
        
        // Sum unread counts for badge
        const totalUnread = list.reduce((acc: number, curr: any) => acc + (curr.unreadCount || 0), 0);
        
        if (totalUnread > unreadCount && user?.email === ADMIN_EMAIL) {
          const latestConv = list.sort((a, b) => b.timestamp - a.timestamp)[0];
          if (latestConv && latestConv.unreadCount > 0 && latestConv.lastMessage?.includes('أرغب في شراء')) {
            setToast({ message: `لديك طلب شراء جديد من ${latestConv.displayName}! 👑`, type: 'info' });
            // Browser notification fallback if supported
            if (Notification.permission === 'granted') {
               new Notification('طلب شراء جديد', { body: `المستخدم ${latestConv.displayName} يرغب في شراء عضوية.` });
            }
          }
        }

        setUnreadCount(totalUnread);
        setHasNewDMs(totalUnread > 0);
      } else {
        setDmConversations([]);
        setUnreadCount(0);
        setHasNewDMs(false);
      }
    });

    return () => unsubDMs();
  }, [user]);

  // Global unread listener
  useEffect(() => {
    if (!user) return;
    
    // Listen to meta node for unreads if we were to restructure, 
    // but for now let's just listen to the whole user_dms node for changes
    // or better, a dedicated unread_count node.
    // Let's stick to the prompt's request for basic notification.
  }, [user]);

  const roomsList = [
    { id: 'public', name: 'العامة', icon: '🌍', desc: 'مجلس يجمع الجميع للنقاش والحوار الراقي' },
    { id: 'iraq', name: 'العراق', icon: '🇮🇶', desc: 'دردشة مخصصة لأهل العراق الكرام' },
    { id: 'saudi', name: 'السعودية', icon: '🇸🇦', desc: 'مجلس أهل المملكة العربية السعودية' },
    { id: 'lebanon', name: 'لبنان', icon: '🇱🇧', desc: 'دردشة الأشقاء في لبنان الجميل' },
    { id: 'kuwait', name: 'الكويت', icon: '🇰🇼', desc: 'ديوانية أهل الكويت الأعزاء' },
    { id: 'egypt', name: 'مصر', icon: '🇪🇬', desc: 'بيت أهل مصر الكرام واللقاءات الودية' }
  ];

  const memberships = [
    { 
      id: 'premium', 
      name: 'عضوية المميز', 
      price: '4.99$', 
      features: ['لون نص الرسالة جوزي', 'هاشتاغ #المميز'],
      color: 'from-orange-800 to-orange-950',
      tag: 'شراء دائم'
    },
    { 
      id: 'influencer', 
      name: 'عضوية المؤثر', 
      price: '9.99$', 
      features: ['لون نص الرسالة أخضر', 'هاشتاغ #المؤثر'],
      color: 'from-green-600 to-emerald-900',
      tag: 'شراء دائم'
    },
    { 
      id: 'famous', 
      name: 'عضوية المشهور', 
      price: '29.99$', 
      features: ['لون نص أحمر متوهج', 'هاشتاغ #المشهور', 'إنشاء غرفة خاصة لـ 20 شخصاً'],
      color: 'from-red-600 to-rose-900',
      tag: 'شراء دائم'
    }
  ];

  const handleOrder = async (membershipName: string) => {
    if (!user) return;
    
    if (user.email === ADMIN_EMAIL) {
      // Instant grant for developer
      const membershipKey = membershipName === 'عضوية المميز' ? 'premium' : (membershipName === 'عضوية المؤثر' ? 'influencer' : 'famous');
      try {
        const { update, ref } = await import('firebase/database');
        const { rtdb } = await import('./firebase');
        
        await setDoc(doc(db, 'users', user.uid), {
          isVip: true,
          membership: membershipKey,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await update(ref(rtdb, `users/${user.uid}`), {
          isVip: true,
          membership: membershipKey
        });

        console.log('تم تفعيل عضوية المطور بنجاح ✅');
        setToast({ message: 'تم تفعيل عضويتك الملكية بنجاح ✅', type: 'success' });
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } catch (e: any) {
        console.error("Order grant error:", e.message || e);
      }
      return;
    }

    const orderCode = Math.floor(100000 + Math.random() * 900000);
    const orderText = `👑 طلب شراء: عضوية ${membershipName} - كود: ${orderCode}`;
    setLoading(true); 
    
    try {
      // 1. Resolve Admin Identity
      let targetId = adminUid;
      let targetPhoto = 'https://api.dicebear.com/7.x/initials/svg?seed=Dody';
      
      const qEmail = query(collection(db, 'users'), where('email', '==', ADMIN_EMAIL));
      const snapEmail = await getDocs(qEmail);
      const adminDoc = snapEmail.empty ? null : snapEmail.docs[0];

      let targetName = 'دودي-Dody 👑';
      let targetUsername = 'aa';

      if (adminDoc) {
        const adminData = adminDoc.data();
        targetId = adminDoc.id;
        targetPhoto = adminData.photoURL || targetPhoto;
        targetName = adminData.displayName || targetName;
        targetUsername = adminData.username || targetUsername;
        setAdminUid(targetId);
      }

      // 2. Guaranteed Real-Time Delivery (Unified Private Chat Path)
      const timestamp = Date.now(); 
      const combinedIds = [user.uid, targetId].sort();
      const chatNode = `private_messages/${combinedIds[0]}_${combinedIds[1]}`;
      
      const updates: any = {};
      
      const newMessageKey = push(ref(rtdb, chatNode)).key;
      updates[`${chatNode}/${newMessageKey}`] = {
        text: orderText,
        uid: user.uid,
        displayName: userData?.displayName || user.displayName || 'عضو ملكي',
        photoURL: userData?.photoURL || user.photoURL || '',
        timestamp
      };

      // Admin Inbox Node: Directly use user_dms for immediate notification and top-of-list jump
      updates[`user_dms/${targetId}/${user.uid}`] = {
        uid: user.uid,
        displayName: userData?.displayName || user.displayName || 'عضو ملكي',
        photoURL: userData?.photoURL || user.photoURL || '',
        lastMessage: orderText,
        timestamp,
        unreadCount: increment(1),
        isOrder: true 
      };

      // User Inbox Node
      updates[`user_dms/${user.uid}/${targetId}`] = {
        uid: targetId,
        displayName: targetName,
        photoURL: targetPhoto,
        lastMessage: orderText,
        username: targetUsername,
        timestamp,
        unreadCount: 0
      };

      await update(ref(rtdb), updates);

      setDmTarget({
        uid: targetId,
        displayName: targetName,
        photoURL: targetPhoto,
        username: targetUsername
      });
      
      setDmInitialMessage(undefined);
      setLoading(false);
      setActiveTab('dms');
      setToast({ message: 'تم إرسال طلبك للمطور دودي ✅', type: 'success' });
    } catch (e: any) {
      console.error("Order process error:", e.message || e);
      setLoading(false);
      alert('حدث خطأ في معالجة الطلب، يرجى المحاولة لاحقاً.');
    }
  };

  const compressImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 150;
          const MAX_HEIGHT = 150;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Use very low quality (0.4) for maximum speed/storage efficiency
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.4);
          resolve(compressedBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleInstantImageUpload = async (file: File) => {
    if (!user) return;
    
    setIsSaving(true);
    setToast({ message: 'جاري تطبيق سحر دودي على الصورة... ✨', type: 'info' });

    try {
      // 1. Convert and compress immediately on client
      const base64Image = await compressImageToBase64(file);

      // 2. Update databases only (Skip Auth PhotoURL limit)
      await Promise.all([
        // Firestore - Store the real image
        setDoc(doc(db, 'users', user.uid), {
          photoURL: base64Image,
          updatedAt: new Date().toISOString()
        }, { merge: true }),
        // RTDB Profile - For real-time sync across rooms
        update(ref(rtdb, `users/${user.uid}`), { photoURL: base64Image })
      ]);

      // 3. Update local state immediately
      setUserData((prev: any) => ({ ...prev, photoURL: base64Image }));
      setPreviewURL(base64Image);
      
      setToast({ message: 'تم تحديث البروفايل بنجاح ملكي! 👑✅', type: 'success' });
      setIsSaving(false);
    } catch (err: any) {
      console.error("Image processing error:", err.message || err);
      setIsSaving(false);
      setToast({ message: 'فشل التحديث، جرب صورة أخرى ❌', type: 'error' });
    }
  };

  const handleSaveProfile = async () => {
    if (!user || isSaving) return;
    
    const cleanedDisplayName = newDisplayName.includes('دودي') && user.email !== ADMIN_EMAIL 
      ? newDisplayName.replace(/دودي|Dody|DODY|👑/gi, '').trim() || 'عضو ملكي'
      : (newDisplayName || user.displayName || 'عضو ملكي');

    // 1. Optimistic Update - Change UI IMMEDIATELY
    setUserData((prev: any) => ({ ...prev, displayName: cleanedDisplayName }));
    setUser((prev: any) => prev ? ({ ...prev, displayName: cleanedDisplayName }) : null);
    
    setIsSaving(true);
    setIsEditingProfile(false); // Close modal instantly
    setToast({ message: 'تم تحديث الاسم لحظياً! ✨', type: 'info' });
    
    try {
      // 2. Perform database updates in parallel background
      await Promise.all([
        // Firestore
        setDoc(doc(db, 'users', user.uid), {
          displayName: cleanedDisplayName,
          updatedAt: new Date().toISOString()
        }, { merge: true }),

        // Auth Profile
        updateProfile(auth.currentUser!, { 
          displayName: cleanedDisplayName 
        }),

        // RTDB Profile
        update(ref(rtdb, `users/${user.uid}`), {
          displayName: cleanedDisplayName,
          lastSeen: Date.now()
        })
      ]);

      setShowSuccess(true);
      setToast({ message: 'تم الحفظ والمزامنة بنجاح ✅', type: 'success' });
      setTimeout(() => setShowSuccess(false), 3000);
      setIsSaving(false);
    } catch (e: any) {
      console.error("Profile update error:", e.message || e);
      setToast({ message: 'حدث خطأ في المزامنة ⚠️', type: 'error' });
      setIsSaving(false);
    }
  };

  const handleSearchUser = async () => {
    if (searchUsername.length < 2 || isSearching) return;
    setIsSearching(true);
    setFoundUser(null);
    try {
      const q = query(collection(db, 'users'), where('username', '==', searchUsername.toLowerCase()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docData = querySnapshot.docs[0].data();
        setFoundUser({ ...docData, uid: querySnapshot.docs[0].id });
      } else {
        alert('لم يتم العثور على مستخدم بهذا اليوزر ⚠️');
      }
    } catch (e: any) {
      console.error("Search error:", e.message || e);
      alert('خطأ في البحث');
    } finally {
      setIsSearching(false);
    }
  };

  const grantFoundUserMembership = async (type: 'premium' | 'influencer' | 'famous') => {
    if (!foundUser) return;
    try {
      await setDoc(doc(db, 'users', foundUser.uid), {
        isVip: true,
        membership: type,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await update(ref(rtdb, `users/${foundUser.uid}`), {
        isVip: true,
        membership: type
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      setFoundUser({ ...foundUser, isVip: true, membership: type });
    } catch (e: any) {
      console.error("Grant membership error:", e.message || e);
      alert('فشل في منح العضوية');
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#05070a] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="relative w-24 h-24"
        >
          <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-[2rem]" />
          <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-[2rem]" />
          <Crown className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-400" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Verification Gate: Check if user is verified
  const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');
  const isVerified = user.emailVerified || isGoogleUser || user.email === ADMIN_EMAIL;

  if (!isVerified) {
    return (
      <div className="min-h-screen bg-[#05070a] flex flex-col items-center justify-center p-6 text-white text-center font-arabic" dir="rtl">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-600/10 rounded-full blur-[120px] -z-0 pointer-events-none" />
        
        <div className="w-24 h-24 bg-red-600/20 rounded-[2rem] flex items-center justify-center mb-8 border border-red-500/30">
          <Mail className="w-12 h-12 text-red-500" />
        </div>

        <h1 className="text-3xl font-black mb-4">يرجى توثيق بريدك الإلكتروني 🔐</h1>
        <p className="text-gray-400 text-sm mb-10 max-w-sm leading-relaxed">
          لقد أرسلنا رابط تفعيل إلى <span className="text-white font-bold">{user.email}</span>. 
          يرجى الضغط على الرابط في بريدك لتتمكن من دخول غرف الدردشة واستخدام المتجر الملكي.
        </p>

        <div className="w-full max-w-xs space-y-4">
          <button 
            disabled={resendingEmail}
            onClick={async () => {
              setResendingEmail(true);
              try {
                await sendEmailVerification(user);
                setToast({ message: 'تم إرسال رابط التفعيل مرة أخرى ✅', type: 'success' });
              } catch (e) {
                setToast({ message: 'فشل الإرسال، حاول لاحقاً ⚠️', type: 'error' });
              } finally {
                setResendingEmail(false);
              }
            }}
            className="w-full bg-white text-gray-900 py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
          >
            {resendingEmail ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>إعادة إرسال الرابط</span>
          </button>

          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-[#161b33] text-white py-5 rounded-2xl font-black text-sm border border-white/5 active:scale-95 transition-all"
          >
            لقد قمت بالتفعيل، حدث الصفحة
          </button>

          <button 
            onClick={() => auth.signOut()}
            className="w-full text-red-500 text-xs font-bold pt-4 underline"
          >
            تسجيل خروج
          </button>
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-10 left-4 right-4 z-[100] flex justify-center"
            >
              <div className={`${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3`}>
                <span className="text-xs font-black">{toast.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (activeRoom) {
    const roomInfo = roomsList.find(r => r.id === activeRoom) || { name: 'العامة' };
    return (
      <>
        <ChatRoom 
          room={activeRoom} 
          roomName={(roomInfo as any).name} 
          onBack={() => setActiveRoom(null)} 
          onOpenDM={(u) => setDmTarget(u)} 
          userData={userData}
        />
        <AnimatePresence>
          {dmTarget && (
            <PrivateChat 
              targetUser={dmTarget} 
              onBack={() => { setDmTarget(null); setDmInitialMessage(undefined); }} 
              initialMessage={dmInitialMessage} 
              userData={userData}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  const isAdmin = user.email === ADMIN_EMAIL;

  return (
    <div className="min-h-screen bg-[#05070a] text-white flex flex-col font-arabic overflow-hidden" dir="rtl">
      {/* Immersive Background */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px] -z-0 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] -z-0 pointer-events-none" />
      
      <header className="p-6 flex justify-between items-center relative z-10 max-w-2xl mx-auto w-full">
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="fixed top-6 left-4 right-4 z-[100] flex justify-center pointer-events-none"
            >
              <div className="bg-indigo-600 text-white px-6 py-4 rounded-[1.5rem] shadow-2xl border border-white/20 flex items-center gap-3 pointer-events-auto backdrop-blur-xl">
                <Bell className="w-5 h-5 animate-bounce" />
                <span className="text-sm font-black">{toast.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black gold-gradient-text"><span>دودي رويال</span></h1>
            {isAdmin && (
              <div className="bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Crown className="w-2.5 h-2.5 text-amber-500" />
                <span className="text-[8px] text-amber-500 font-black"><span>إدارة المطور</span></span>
              </div>
            )}
          </div>
          <p className="text-gray-500 text-xs font-bold"><span>بواسطة المطور دودي-Dody 👑</span></p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src={userData?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`} 
              className="w-10 h-10 rounded-xl border border-white/10" 
              alt="me" 
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#05070a] rounded-full" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24 relative z-10 max-w-2xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'rooms' && (
            <motion.div 
              key="rooms"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 mb-4">
                <LayoutGrid className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">الغرف الملكية المتاحة</h2>
              </div>
              
              {roomsList.map((r, idx) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => setActiveRoom(r.id)}
                  className="group relative flex items-center gap-4 p-4 bg-[#0a0f18]/60 backdrop-blur-xl rounded-2xl cursor-pointer hover:bg-[#111827]/80 transition-all border border-white/5 overflow-hidden"
                >
                  <div className="w-10 h-10 rounded-full bg-[#05070a] border border-white/10 flex items-center justify-center text-xl shrink-0">
                    {r.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white group-hover:text-indigo-400 transition-colors truncate"><span>غرفة {r.name}</span></h3>
                    <p className="text-gray-500 text-[10px] truncate"><span>{r.desc}</span></p>
                  </div>

                  <ChevronLeft className="w-4 h-4 text-gray-700 rotate-180 group-hover:text-indigo-400 transition-colors" />
                </motion.div>
              ))}
            </motion.div>
          )}

          {activeTab === 'store' && (
            <motion.div 
              key="store"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center py-4 px-6 bg-indigo-600/10 border border-indigo-500/20 rounded-3xl">
                <h2 className="text-xl font-black gold-gradient-text mb-2">المتجر الملكي</h2>
                <p className="text-gray-500 text-[11px] text-indigo-300 font-bold leading-relaxed">
                  💡 ملاحظة: بعد الضغط على الطلب، سيتم توجيهك للمطور دودي-Dody للاتفاق على طريقة الدفع وتفعيل العضوية لك يدوياً.
                </p>
              </div>

              <div className="space-y-4">
                {memberships.map((m, idx) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`bg-gradient-to-br ${m.color} p-6 rounded-[2rem] shadow-xl relative overflow-hidden group border border-white/10`}
                  >
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="mb-4">
                        <h3 className="text-xl font-black text-white mb-1 uppercase tracking-wider"><span>{m.name}</span></h3>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-black text-white"><span>{m.price}</span></span>
                          <span className="text-[10px] text-white/60 font-bold uppercase"><span>مدى الحياة</span></span>
                        </div>
                      </div>

                      <div className="w-full h-px bg-white/10 mb-5" />

                      <ul className="space-y-3 mb-8">
                        {m.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-3 text-xs text-white/90 font-bold text-right w-full" dir="rtl">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                            <span><span>{f}</span></span>
                          </li>
                        ))}
                      </ul>

                      <button 
                        onClick={() => handleOrder(m.name)}
                        className="mt-auto w-full bg-white text-[#05070a] py-4 rounded-2xl font-black text-sm shadow-2xl active:scale-95 transition-all hover:bg-gray-100 uppercase tracking-wide"
                      >
                        {user.email === 'lm656508@gmail.com' ? 'تفعيل فوري للمطور' : 'اطلب الآن'}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'dms' && (
            <motion.div 
              key="dms"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">رسائلي الخاصة</h2>
              </div>

              {dmConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                  <MessageSquare className="w-20 h-20 mb-4" />
                  <p className="font-bold">لا توجد رسائل خاصة بعد</p>
                </div>
              ) : (
                dmConversations.map((conv: any) => (
                  <div 
                    key={conv.uid}
                    onClick={() => setDmTarget(conv)}
                    className="flex items-center gap-4 p-4 bg-[#0a0f18]/60 border border-white/5 rounded-2xl cursor-pointer hover:bg-white/5 transition-all relative group"
                  >
                    <img 
                      src={conv.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${conv.displayName || 'User'}`} 
                      className="w-12 h-12 rounded-xl border border-white/10" 
                      alt="conv"
                      loading="lazy"
                    />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="font-bold text-sm"><span>{conv.displayName}</span></h3>
                          {conv.unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg">
                              <span>{conv.unreadCount}</span>
                            </span>
                          )}
                        </div>
                        <p className={`text-xs truncate ${conv.isOrder ? 'text-red-500 font-extrabold animate-pulse flex items-center gap-1' : 'text-gray-500'}`}>
                          {conv.isOrder && <Sparkles className="w-3 h-3 text-red-500" />}
                          <span>{conv.lastMessage}</span>
                        </p>
                      </div>
                    <ChevronLeft className="w-4 h-4 text-gray-700 rotate-180 group-hover:text-indigo-400 transition-colors" />
                  </div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 flex flex-col items-center py-10"
            >
              <div className="relative group">
                <div className="w-32 h-32 rounded-[2.5rem] bg-indigo-600/20 p-1">
                  <img 
                    src={previewURL || userData?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`} 
                    className="w-full h-full rounded-[2.2rem] object-cover border-2 border-indigo-500 shadow-2xl" 
                    alt="profile" 
                  />
                </div>
                <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center border-4 border-[#05070a] text-white shadow-xl hover:scale-110 transition-transform cursor-pointer">
                  <Camera className="w-5 h-5" />
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleInstantImageUpload(file);
                      }
                    }}
                  />
                </label>
              </div>

              <AnimatePresence>
                {showSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-green-500 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg"
                  >
                    <Check className="w-3 h-3" />
                    تم حفظ التعديلات بنجاح ✅
                  </motion.div>
                )}
              </AnimatePresence>

              {isEditingProfile ? (
                <div className="w-full space-y-4 bg-[#0a0f18]/60 p-6 rounded-3xl border border-white/10 backdrop-blur-xl">
                   <div>
                     <label className="text-[10px] text-gray-500 font-bold mr-2 uppercase">اسم المستخدم الجديد</label>
                     <input 
                       value={newDisplayName}
                       onChange={(e) => setNewDisplayName(e.target.value)}
                       placeholder="ادخل اسمك هنا..."
                       className="w-full bg-[#05070a] border border-white/10 rounded-xl p-3 text-sm mt-1 outline-none focus:border-indigo-500 transition-colors"
                     />
                   </div>
                   
                   <div className="flex gap-2 pt-2">
                     <button 
                       disabled={isSaving}
                       onClick={handleSaveProfile}
                       className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                     >
                       {isSaving ? (
                         <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                       ) : (
                         <Check className="w-4 h-4" />
                       )}
                       حفظ التعديلات
                     </button>
                     <button 
                       onClick={() => { setIsEditingProfile(false); setPreviewURL(''); setSelectedFile(null); }}
                       className="flex-1 bg-white/5 text-gray-400 py-3 rounded-xl font-bold text-xs"
                     >
                       إلغاء
                     </button>
                   </div>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className="text-2xl font-black mb-1 flex items-center justify-center gap-2">
                    <span>{userData?.displayName || user.displayName || 'عضو ملكي'}</span>
                    <Edit2 className="w-4 h-4 text-gray-600 cursor-pointer hover:text-indigo-400" onClick={() => { setIsEditingProfile(true); setNewDisplayName(userData?.displayName || user.displayName || ''); }} />
                  </h2>
                  <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest bg-indigo-400/10 px-3 py-1 rounded-full inline-block">
                    <span>{user.email === ADMIN_EMAIL ? 'المطور الملكي 👑' : (userData?.isVip ? 'VIP' : 'عضو ملكي')}</span>
                  </div>
                  {(userData?.username || (user.email === ADMIN_EMAIL ? 'aa' : null)) && (
                    <div className="mt-2 text-indigo-400 text-[10px] font-black tracking-widest bg-indigo-400/5 px-2 py-0.5 rounded border border-indigo-500/20 shadow-lg uppercase">
                      <span>Username: {user.email === ADMIN_EMAIL ? 'aa' : userData.username}</span>
                    </div>
                  )}
                </div>
              )}

              {isAdmin && (
                <div className="w-full bg-[#0a0f18]/40 border border-amber-500/10 rounded-[2rem] p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-black text-amber-500 uppercase">لوحة تحكم المطور</h3>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold mr-2">البحث عن مستخدم باليوزر</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                          type="text"
                          value={searchUsername}
                          onChange={(e) => setSearchUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                          placeholder="مثلاً: aa"
                          className="w-full bg-[#05070a] border border-white/5 rounded-xl py-3 pr-10 pl-4 text-sm outline-none focus:border-amber-500 transition-colors font-mono"
                        />
                      </div>
                      <button 
                        onClick={handleSearchUser}
                        disabled={searchUsername.length < 2 || isSearching}
                        className="bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white px-6 rounded-xl font-bold text-xs transition-all active:scale-95"
                      >
                        {isSearching ? '...' : 'بحث'}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {foundUser && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center gap-3"
                      >
                        <div className="flex items-center gap-3 w-full">
                          <img 
                            src={foundUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${foundUser.displayName}`} 
                            className="w-10 h-10 rounded-lg border border-white/10"
                            alt="found"
                          />
                          <div className="flex-1">
                            <div className="font-bold text-sm">{foundUser.displayName}</div>
                            <div className="text-[9px] text-gray-500 font-mono tracking-tighter">{foundUser.email}</div>
                          </div>
                          {foundUser.isVip && (
                            <span className="bg-amber-500/20 text-amber-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-500/30">
                              {foundUser.membership}
                            </span>
                          )}
                        </div>

                      {showSuccess ? (
                        <div className="w-full flex flex-col items-center justify-center py-4 bg-green-500/10 border border-green-500/20 rounded-2xl animate-pulse">
                          <Check className="w-6 h-6 text-green-500 mb-1" />
                          <span className="text-[10px] text-green-500 font-black">تم منح الرتبة بنجاح ✅</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 w-full mt-2">
                          <button 
                            onClick={() => grantFoundUserMembership('famous')}
                            className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 py-2 rounded-lg text-[9px] font-black transition-all active:scale-95"
                          >
                            منح مشهور
                          </button>
                          <button 
                            onClick={() => grantFoundUserMembership('influencer')}
                            className="bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white border border-green-500/20 py-2 rounded-lg text-[9px] font-black transition-all active:scale-95"
                          >
                            منح مؤثر
                          </button>
                          <button 
                            onClick={() => grantFoundUserMembership('premium')}
                            className="bg-orange-500/10 hover:bg-orange-500 text-orange-500 hover:text-white border border-orange-500/20 py-2 rounded-lg text-[9px] font-black transition-all active:scale-95"
                          >
                            منح مميز
                          </button>
                        </div>
                      )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="w-full grid grid-cols-2 gap-4">
                <div className="bg-[#0a0f18]/60 p-4 rounded-2xl border border-white/5 text-center">
                  <div className="text-2xl font-black mb-1">0</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">الرسائل اليوم</div>
                </div>
                <div className="bg-[#0a0f18]/60 p-4 rounded-2xl border border-white/5 text-center">
                  <div className="text-2xl font-black mb-1">0</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">الأوسمة</div>
                </div>
              </div>

              <button 
                onClick={() => auth.signOut()}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/10 font-bold text-sm hover:bg-red-500 hover:text-white transition-all active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج الملكي</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {dmTarget && (
          <PrivateChat 
            targetUser={dmTarget} 
            onBack={() => { setDmTarget(null); setDmInitialMessage(undefined); }} 
            initialMessage={dmInitialMessage} 
            userData={userData}
          />
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-[#0a0f18]/95 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around px-4 z-50">
        <button 
          onClick={() => setActiveTab('rooms')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === 'rooms' ? 'text-indigo-400' : 'text-gray-500'}`}
        >
          <LayoutGrid className={activeTab === 'rooms' ? 'w-6 h-6' : 'w-5 h-5 opacity-60'} />
          <span className="text-[10px] font-black">الغرف</span>
        </button>

        <button 
          onClick={() => setActiveTab('store')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 relative -top-3`}
        >
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_8px_20px_rgba(245,158,11,0.3)] border-4 border-[#05070a] transition-all active:scale-90 ${activeTab === 'store' ? 'scale-110 ring-4 ring-amber-500/20' : 'opacity-80'}`}>
            <Crown className="w-7 h-7 text-white" />
          </div>
          <span className={`text-[10px] font-black ${activeTab === 'store' ? 'text-amber-500' : 'text-gray-500'}`}>المتجر</span>
        </button>

        <button 
          onClick={() => setActiveTab('dms')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === 'dms' ? 'text-indigo-400' : 'text-gray-500'}`}
        >
          <div className="relative">
            <MessageSquare className={activeTab === 'dms' ? 'w-6 h-6' : 'w-5 h-5 opacity-60'} />
            {hasNewDMs && (
              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#0a0f18] animate-pulse">
                {unreadCount > 9 ? '+9' : unreadCount}
              </div>
            )}
          </div>
          <span className="text-[10px] font-black">الخاص</span>
        </button>

        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === 'profile' ? 'text-indigo-400' : 'text-gray-500'}`}
        >
          <Users className={activeTab === 'profile' ? 'w-6 h-6' : 'w-5 h-5 opacity-60'} />
          <span className="text-[10px] font-black">بروفايلي</span>
        </button>
      </nav>
    </div>
  );
}

