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

// Scraper function
async function scrapePaginatedListings() {
  let page = 1;
  let emptyPageCount = 0;

  while (emptyPageCount < 3) {
    console.log(`Fetching URL: https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort&page=${page}`);
    const response = await fetch(`https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort&page=${page}`);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Detect advert containers and filter out ineligible adverts
    const adverts = [];
    $("article.relative.flex").each((_, element) => {
      const advertURL = $(element).find("a").attr("href");
      if (advertURL && !advertURL.includes("auctions") && !advertURL.includes("make-an-offer")) {
        const id = advertURL.split("/").pop();
        const price = $(element).find("h3").text().trim();
        const location = $(element).find("span.text-xs.font-semibold").text().trim();
        const title = $(element).find("h2").text().trim();

        adverts.push({ id, price, location, title, url: advertURL });
      }
    });

    // Output the correct number of in-scope adverts
    const inScopeAdvertsCount = adverts.length;

    if (inScopeAdvertsCount === 0) {
      console.log(`No adverts found on page ${page}. Empty page count: ${emptyPageCount + 1}/3.`);
      emptyPageCount++;
    } else {
      console.log(`Found ${inScopeAdvertsCount} adverts on page ${page}.`);
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
            const updatedPriceHistory = existingAdvert.priceHistory || [];
            updatedPriceHistory.push({ date: new Date().toISOString(), price: advert.price });

            await advertRef.update({
              price: advert.price,
              priceHistory: updatedPriceHistory,
            });
          }
        }
      }
    }

    page++;
    console.log("Waiting 10 seconds before fetching the next page...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  console.log("Scraping completed.");
}

scrapePaginatedListings().catch((error) => {
  console.error("Error during scraping:", error);
});
