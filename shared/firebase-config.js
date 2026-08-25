// ============================================================
// Shared Firebase configuration — Badminton Sports Day 2026
// Used by both index.html (scoreboard/admin) and umpire.html.
// Load AFTER the Firebase compat SDK and BEFORE any app script.
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyBkBG12LfotDkqLxvVpNC6HL_S5ZZRoNlI",
  authDomain: "badminton-2026-687e7.firebaseapp.com",
  databaseURL: "https://badminton-2026-687e7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "badminton-2026-687e7",
  storageBucket: "badminton-2026-687e7.firebasestorage.app",
  messagingSenderId: "343768836958",
  appId: "1:343768836958:web:7ab545de2bc0bb74a23dcf"
};

firebase.initializeApp(firebaseConfig);
