// Import required modules
import * as cheerio from "cheerio"; // Ensure proper ES module import
import fetch from "node-fetch";
import admin from "firebase-admin";

// Load Firebase Service Account Key from environment variables
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://car-price-tracker-e0a6b-default-rtdb.firebaseio.com",
  });
}

const db = admin.database();

// Function to fetch with retry logic
async function fetchWithRetry(url, retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response;
    } catch (error) {
      console.warn(`Fetch attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`);
      if (i < retries - 1) await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries.`);
}

// Scraper function
async function scrapePaginatedListings() {
  let page = 1;
  let emptyPageCount = 0;

  while (emptyPageCount < 3) {
    const url = `https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort&page=${page}`;
    console.log(`Fetching URL: ${url}`);

    try {
      const response = await fetchWithRetry(url);
      const html = await response.text();
      const $ = cheerio.load(html);

      const adverts = [];
      $(".relative.flex").each((_, element) => {
        const advertURL = $(element).find("a").attr("href");
        if (advertURL && !advertURL.includes("auctions") && !advertURL.includes("make-an-offer")) {
          const id = advertURL.split("/").pop();
          const price = $(element).find("h3").text().trim();
          const location = $(element).find("span.text-xs.font-semibold").text().trim();
          const title = $(element).find("h2").text().trim();

          adverts.push({ id, price, location, title, url: advertURL });
        }
      });

      if (adverts.length === 0) {
        console.log(`No adverts found on page ${page}. Empty page count: ${emptyPageCount + 1}/3.`);
        emptyPageCount++;
      } else {
        console.log(`Found ${adverts.length} adverts on page ${page}.`);
        emptyPageCount = 0;

        for (const advert of adverts) {
          const advertRef = db.ref(`adverts/${advert.id}`);
          const snapshot = await advertRef.get();

          if (!snapshot.exists()) {
            console.log(`New advert added: ${advert.id}`);
            await advertRef.set({
              id: advert.id,
              title: advert.title,
              price: advert.price,
              location: advert.location,
              url: advert.url,
              advertisedDate: new Date().toISOString(),
              priceHistory: [{ date: new Date().toISOString(), price: advert.price }],
            });
          } else {
            const existingAdvert = snapshot.val();
            if (existingAdvert.price !== advert.price) {
              console.log(`Price change detected for advert ID ${advert.id}: ${existingAdvert.price} -> ${advert.price}`);
              const priceHistory = existingAdvert.priceHistory || [];
              priceHistory.push({ date: new Date().toISOString(), price: advert.price });
              await advertRef.update({
                price: advert.price,
                priceHistory,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break; // Exit loop if fetch fails entirely
    }

    page++;
    console.log("Waiting 20 seconds before fetching the next page...");
    await new Promise((resolve) => setTimeout(resolve, 20000)); // 20-second delay
  }

  console.log("Scraping completed.");
}

scrapePaginatedListings().catch((error) => {
  console.error("Error during scraping:", error);
});
