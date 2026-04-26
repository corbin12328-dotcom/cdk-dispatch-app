import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBLjKsfI-kyGpnBag3a2yPZg2Ud5JIQ62U",
  authDomain: "dispatch-71eba.firebaseapp.com",
  projectId: "dispatch-71eba",
  storageBucket: "dispatch-71eba.firebasestorage.app",
  messagingSenderId: "432023169419",
  appId: "1:432023169419:web:9f4b36f20ee3c980ce278e"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
