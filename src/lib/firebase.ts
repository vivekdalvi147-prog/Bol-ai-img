import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDMHcNptC79noIVzoDyc7YTQNLNkRpOXZ8",
  authDomain: "bol-ai-img.firebaseapp.com",
  projectId: "bol-ai-img",
  storageBucket: "bol-ai-img.firebasestorage.app",
  messagingSenderId: "1035193114183",
  appId: "1:1035193114183:web:979451e3b13628b93c9b62"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

