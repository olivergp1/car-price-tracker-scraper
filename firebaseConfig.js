const firebaseConfig = {
    apiKey: "AIzaSyAz75LbtmfhQWsjNCvBxmLZJpHBhs29fNo",
  authDomain: "car-price-tracker-e0a6b.firebaseapp.com",
  databaseURL: "https://car-price-tracker-e0a6b-default-rtdb.firebaseio.com",
  projectId: "car-price-tracker-e0a6b",
  storageBucket: "car-price-tracker-e0a6b.firebasestorage.app",
  messagingSenderId: "1016805259851",
  appId: "1:1016805259851:web:bc346c97d57524e868abce"
};
console.log("firebaseConfig.js loaded successfully.");

firebase.database.enableLogging(true); // Enable Firebase logging for debugging