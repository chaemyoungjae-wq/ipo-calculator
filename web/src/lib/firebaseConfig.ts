import type { FirebaseOptions } from "firebase/app";

/**
 * Firebase 콘솔의 웹 앱 설정값. 이 값은 비밀번호가 아니라 프로젝트 식별 정보이고,
 * 웹앱에는 어차피 공개된다. 데이터는 firestore.rules의 접근 규칙이 보호한다.
 */
const PRODUCTION_CONFIG: FirebaseOptions = {
  apiKey: "AIzaSyCZ4eFrte746Q6gQ4K6AaicH20iHQayJm8",
  authDomain: "ipo-calculator-e8859.firebaseapp.com",
  projectId: "ipo-calculator-e8859",
  storageBucket: "ipo-calculator-e8859.firebasestorage.app",
  messagingSenderId: "12450337956",
  appId: "1:12450337956:web:543020ab9ada9678af8231",
};

export const USE_EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === "1";

export const firebaseConfig: FirebaseOptions | null = USE_EMULATOR
  ? { apiKey: "demo-key", authDomain: "demo-ipo.firebaseapp.com", projectId: "demo-ipo", appId: "demo-app" }
  : PRODUCTION_CONFIG;
