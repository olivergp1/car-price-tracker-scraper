import * as cheerio from "cheerio";
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

const database = admin.database();
const baseURL =
  "https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort";

async function scrapePaginatedListings() {
  console.log("Scraping paginated listings...");
  let page = 1;
  let emptyPageCount = 0;

  while (emptyPageCount < 3) {
    const url = `${baseURL}&page=${page}`;
    console.log(`Fetching URL: ${url}`);
    const adverts = await scrapePage(url);

    if (adverts.length === 0) {
      emptyPageCount++;
      console.log(`No adverts found on page ${page}. Empty page count: ${emptyPageCount}/3.`);
    } else {
      console.log(`Processed page ${page} with ${adverts.length} adverts.`);
      emptyPageCount = 0;
    }

    page++;
    console.log("Waiting 10 seconds before fetching the next page...");
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds between pages
  }

  console.log("Scraping completed.");
}

async function scrapePage(url) {
  try {
    const response = await fetch(url, { timeout: 30000 }); // Allow up to 30 seconds for the page to load
    const html = await response.text();
    const $ = cheerio.load(html);

    const adverts = [];
    $("article").each(async (index, element) => {
      const advertURL = $(element).find("a").attr("href");

      if (!advertURL) {
        console.log("Skipping advert with missing URL");
        return;
      }

      // Filter out auctions and make-an-offer adverts
      if (advertURL.includes("auctions") || advertURL.includes("make-an-offer")) {
        console.log(`Skipping advert with URL: ${advertURL}`);
        return;
      }

      const advertID = advertURL.split("/").pop();
      const price = $(element).find("h3").text().trim();
      const location = $(element).find(".text-xs.font-semibold").text().trim();

      const advertData = {
        id: advertID,
        price,
        location,
        advertisedDate: new Date().toISOString(),
        priceHistory: [],
      };

      await saveAdvertData(advertData);
      adverts.push(advertData);
    });

    return adverts;
  } catch (error) {
    console.error(`Error fetching page: ${error.message}`);
    return [];
  }
}

async function saveAdvertData(advert) {
  const advertRef = database.ref(`adverts/${advert.id}`);
  const snapshot = await advertRef.once("value");
  const existingData = snapshot.val();

  if (existingData) {
    // If advert already exists, check for price changes
    if (existingData.price !== advert.price) {
      console.log(
        `Price change detected for advert ID ${advert.id}: ${existingData.price} -> ${advert.price}`
      );

      const priceHistory = existingData.priceHistory || [];
      priceHistory.push({
        date: new Date().toISOString(),
        price: advert.price,
      });

      await advertRef.update({
        price: advert.price,
        priceHistory,
      });
    } else {
      console.log(`No price change for advert ID ${advert.id}`);
    }
  } else {
    // New advert
    console.log(`New advert added: ${advert.id}`);
    advert.priceHistory.push({
      date: new Date().toISOString(),
      price: advert.price,
    });
    await advertRef.set(advert);
  }
}

// Start scraping
scrapePaginatedListings().catch((error) => {
  console.error("Error during scraping:", error);
});
