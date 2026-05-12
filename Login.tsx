import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { auth } from '../firebase';
import { Crown, Mail, Lock, LogIn, Sparkles, Terminal, ShieldCheck, MailQuestion } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [username, setUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("يرجى ملء جميع الحقول المطلوبة.");
      return;
    }
    
    setError(null);
    setSuccess(null);
    setIsLoggingIn(true);
    
    try {
      if (isRegistering) {
        if (username.length < 2 || username.length > 10) {
          throw new Error("يجب أن يكون اسم المستخدم بين 2 و 10 أحرف.");
        }
        if (!/^[a-zA-Z0-9]+$/.test(username)) {
           throw new Error("يجب أن يحتوي اسم المستخدم على أحرف وأرقام إنجليزية فقط.");
        }

        const { doc, getDocs, collection, query, where, setDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase');

        // Check if username is taken
        const userQ = query(collection(db, 'users'), where('username', '==', username.toLowerCase()));
        const userSnap = await getDocs(userQ);
        if (!userSnap.empty) {
          throw new Error("هذا اسم المستخدم محجوز بالفعل.");
        }
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Send verification email
        await sendEmailVerification(user);
        
        const isDev = email === 'lm656508@gmail.com';
        
        await setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          displayName: isDev ? 'دودي-Dody 👑' : username,
          username: isDev ? 'aa' : username.toLowerCase(),
          createdAt: new Date().toISOString(),
          isBanned: false,
          isMuted: false,
          isVip: isDev,
          emailVerified: isDev, // Dev is trusted instantly
          membership: isDev ? 'famous' : 'none'
        }, { merge: true });

        setSuccess("تم إنشاء الحساب بنجاح! يرجى مراجعة بريدك لتفعيله قبل الدخول.");
        setIsRegistering(false);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        
        if (userDoc.exists() && userDoc.data().isBanned) {
          await auth.signOut();
          setError("عذراً، هذا الحساب محظور نهائياً.");
        }
      }
    } catch (err: any) {
      let errorMsg = "خطأ في تسجيل الدخول. تأكد من البيانات.";
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = "كلمة المرور أو البريد غير صحيح.";
      } else if (err.code === 'auth/email-already-in-use') {
        errorMsg = "هذا البريد مسجل مسبقاً.";
      } else if (err.code === 'auth/weak-password') {
        errorMsg = "كلمة المرور ضعيفة جداً.";
      } else if (err.message) {
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError("أدخل بريدك أولاً لإرسال رابط استعادة كلمة المرور.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess("تم إرسال رابط استعادة كلمة المرور إلى بريدك ✉️");
    } catch (err: any) {
      setError("فشل إرسال الرابط.");
    }
  };

  const isManagerEmail = email === 'lm656508@gmail.com';

  return (
    <div className="min-h-screen bg-[#05070a] flex flex-col items-center justify-center p-6 text-white relative overflow-hidden font-arabic" dir="rtl">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[160px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[160px] animate-pulse" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full flex flex-col items-center text-center relative z-10"
      >
        <div className="relative mb-10 group">
          <motion.div className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_60px_rgba(79,70,229,0.4)]">
            <Crown className="w-12 h-12 text-white" />
          </motion.div>
        </div>

        <h1 className="text-5xl font-black mb-2 tracking-tighter bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">دودي</h1>
        <p className="text-gray-500 mb-8 text-sm font-bold tracking-widest flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          بوابة التوثيق الرسمية
        </p>

        <div className="w-full bg-[#161b33]/40 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-xl shadow-2xl">
          <div className="mb-8">
            <h2 className="text-xl font-black text-white">
              {isRegistering ? 'إنشاء حساب رسمي' : 'تأكيد الهوية'}
            </h2>
            <p className="text-gray-500 text-xs mt-2 font-bold">
              {isRegistering ? 'انضم إلى النخبة الملكية اليوم' : 'سجل دخولك للقاعات الفاخرة'}
            </p>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <AnimatePresence mode="wait">
              {isRegistering && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="relative"
                >
                  <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
                  <input 
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                    placeholder="اسم المستخدم (بالإنجليزي)"
                    maxLength={10}
                    className="w-full bg-[#0a0b1e] border border-gray-800 rounded-2xl py-4 pl-12 pr-6 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
              <input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني"
                className="w-full bg-[#0a0b1e] border border-gray-800 rounded-2xl py-4 pl-12 pr-6 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
              <input 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                className="w-full bg-[#0a0b1e] border border-gray-800 rounded-2xl py-4 pl-12 pr-12 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                {showPassword ? <Sparkles className="w-4 h-4" /> : <Lock className="w-4 h-4 opacity-50" />}
              </button>
            </div>

            {error && <div className="text-red-400 text-xs text-right bg-red-500/5 p-3 rounded-xl border border-red-500/10">⚠️ {error}</div>}
            {success && <div className="text-green-400 text-xs text-right bg-green-500/5 p-3 rounded-xl border border-green-500/10">✅ {success}</div>}

            <button 
              type="submit" 
              disabled={isLoggingIn} 
              className={`w-full ${isManagerEmail ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'} text-white py-5 rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50`}
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegistering ? 'فتح الحساب الملكي' : 'تأكيد الدخول'}</span>
                  <LogIn className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between px-2 pt-2">
              <button 
                type="button" 
                onClick={() => { setIsRegistering(!isRegistering); setError(null); setSuccess(null); }} 
                className="text-indigo-400 text-xs font-bold hover:underline"
              >
                {isRegistering ? 'لديك حساب؟ سجل دخول' : 'ليس لديك حساب؟ سجل الآن'}
              </button>
              {!isRegistering && (
                <button type="button" onClick={handleResetPassword} className="text-gray-500 text-xs hover:text-white transition-colors">
                  نسيت كلمة السر؟
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="mt-12 flex items-center gap-6 text-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">بصمة أمان</span>
          </div>
          <div className="w-px h-6 bg-white/5" />
          <div className="flex items-center gap-2">
            <MailQuestion className="w-5 h-5 text-indigo-400/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">توثيق إلزامي</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
