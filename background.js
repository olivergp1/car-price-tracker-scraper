// Import Firebase Libraries
try {
  importScripts(
      "libs/firebase-app.js",
      "libs/firebase-database.js"
  );
  console.log("Firebase libraries loaded in background.js.");
} catch (error) {
  console.error("Error loading Firebase libraries in background.js:", error);
}

// Firebase Initialization
try {
  const firebaseConfig = {
    apiKey: "AIzaSyAz75LbtmfhQWsjNCvBxmLZJpHBhs29fNo",
    authDomain: "car-price-tracker-e0a6b.firebaseapp.com",
    databaseURL: "https://car-price-tracker-e0a6b-default-rtdb.firebaseio.com",
    projectId: "car-price-tracker-e0a6b",
    storageBucket: "car-price-tracker-e0a6b.firebasestorage.app",
    messagingSenderId: "1016805259851",
    appId: "1:1016805259851:web:bc346c97d57524e868abce",
  };

  firebase.initializeApp(firebaseConfig);
  console.log("Firebase initialized in background.js.");
} catch (error) {
  console.error("Error initializing Firebase in background.js:", error);
}

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fetchAdvertData") {
      const advertId = message.advertId;

      firebase.database().ref(`/adverts/${advertId}`).once("value")
          .then((snapshot) => {
              const data = snapshot.val();
              sendResponse({ data });
          })
          .catch((error) => {
              console.error(`Error fetching data for advert ID ${advertId}:`, error);
              sendResponse({ data: null });
          });

      // Return true to indicate the response will be sent asynchronously
      return true;
  }
});
