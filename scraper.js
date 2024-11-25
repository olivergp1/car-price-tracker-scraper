const firebase = require("firebase/app");
require("firebase/database");

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAz75LbtmfhQWsjNCvBxmLZJpHBhs29fNo",
  authDomain: "car-price-tracker-e0a6b.firebaseapp.com",
  databaseURL: "https://car-price-tracker-e0a6b-default-rtdb.firebaseio.com",
  projectId: "car-price-tracker-e0a6b",
  storageBucket: "car-price-tracker-e0a6b.firebasestorage.app",
  messagingSenderId: "1016805259851",
  appId: "1:1016805259851:web:bc346c97d57524e868abce",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

/**
 * Scrapes paginated listings from CarAndClassic.
 * @param {string} startUrl The starting URL for the scraper.
 */
async function scrapePaginatedListings(startUrl) {
    console.log(`Starting scraper at ${startUrl}...`);

    let nextUrl = startUrl;
    let emptyPages = 0;

    while (nextUrl && emptyPages < 3) {
        console.log(`Scraping page: ${nextUrl}`);

        try {
            // Use fetch to get the page data
            const response = await fetch(nextUrl);
            const html = await response.text();

            // Use a library like jsdom or cheerio to parse the HTML
            const cheerio = require("cheerio");
            const $ = cheerio.load(html);

            // Find advert containers and extract data
            const adverts = $("article.relative.flex");
            if (adverts.length === 0) {
                emptyPages++;
                console.log(`No adverts found on page. Empty pages count: ${emptyPages}`);
            } else {
                emptyPages = 0; // Reset empty pages count
            }

            adverts.each((index, advert) => {
                const advertId = $(advert).find("a[href]").attr("href").split("/").pop();
                const title = $(advert).find("h2").text().trim();
                const price = $(advert).find("h3").text().trim();
                const location = $(advert).find(".text-xs").text().trim();

                console.log(`Advert found: ID=${advertId}, Title=${title}, Price=${price}, Location=${location}`);

                // Save advert data to Firebase
                database.ref(`/adverts/${advertId}`).set({
                    title,
                    price,
                    location,
                    advertisedDate: new Date().toISOString(),
                });
            });

            // Get the next page URL
            const nextPageLink = $("a.next-page"); // Update selector as needed
            nextUrl = nextPageLink.length > 0 ? nextPageLink.attr("href") : null;

        } catch (error) {
            console.error(`Error scraping page ${nextUrl}:`, error);
            break;
        }
    }

    console.log("Scraper finished.");
}

/**
 * Main entry point for the scraper.
 */
async function main() {
    const startUrl = "https://www.carandclassic.com/search?listing_type_ex=advert&page=1&sort=latest&source=modal-sort";
    await scrapePaginatedListings(startUrl);
}

// Run the script if executed directly
if (require.main === module) {
    main();
}
