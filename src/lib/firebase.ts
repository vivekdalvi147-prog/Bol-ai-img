import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: "AIzaSyDMHcNptC79noIVzoDyc7YTQNLNkRpOXZ8",
  authDomain: "bol-ai-img.firebaseapp.com",
  projectId: "bol-ai-img",
  storageBucket: "bol-ai-img.firebasestorage.app",
  messagingSenderId: "1035193114183",
  appId: "1:1035193114183:web:979451e3b13628b93c9b62"
};

const app = initializeApp(firebaseConfig);

// Initialize App Check
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6Lc1sZwsAAAAAOIHBQaiVrl-NTL6wM9aIEK1jds3'),
  isTokenAutoRefreshEnabled: true
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
googleProvider.setCustomParameters({
  prompt: 'consent'
});
export const db = getFirestore(app);

