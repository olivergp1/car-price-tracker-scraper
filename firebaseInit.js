console.log("firebaseInit.js loaded.");

function initializeFirebase() {
    console.log("Initializing Firebase...");
    try {
        console.log("Firebase config:", firebaseConfig);

        if (!firebase || !firebase.initializeApp) {
            console.error("Firebase SDK is not loaded properly.");
            throw new Error("Firebase SDK is missing or not accessible.");
        }

        firebase.initializeApp(firebaseConfig);
        console.log("Firebase initialized successfully.");

        const database = firebase.database();
        if (!database) {
            console.error("Firebase database is not available.");
            throw new Error("Firebase database unavailable.");
        } else {
            console.log("Firebase database initialized successfully.");
        }
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        throw new Error("Firebase failed to initialize");
    }
}
