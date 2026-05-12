import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// Note: Using the provided user config. 
const firebaseConfig = {
  apiKey: "AIzaSyDNAws_ZF07sQFXCD6LX-AEqzH6fu4CXMI",
  authDomain: "dody-a3a0f.firebaseapp.com",
  projectId: "dody-a3a0f",
  databaseURL: "https://dody-a3a0f-default-rtdb.firebaseio.com",
  storageBucket: "dody-a3a0f.firebasestorage.app",
  messagingSenderId: "192748461386",
  appId: "1:192748461386:web:db53c926937748d7d5b5b3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Experimental force long polling can help in environments where web sockets are unstable or blocked (like some iframes)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
