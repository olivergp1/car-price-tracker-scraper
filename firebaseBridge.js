(function () {
    if (typeof firebase !== "undefined") {
        console.log("Firebase object exposed globally.");
        window.firebase = firebase; // Explicitly set the global Firebase object
    } else {
        console.error("Firebase is not loaded.");
    }
})();
