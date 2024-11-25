import fetch from "node-fetch";
import * as cheerio from "cheerio";
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

async function saveAdvertData(advert) {
  const ref = db.ref(`adverts/${advert.id}`);
  const snapshot = await ref.get();

  if (!snapshot.exists()) {
    // New advert detected
    await ref.set({
      id: advert.id,
      url: advert.url,
      title: advert.title,
      price: advert.price,
      location: advert.location,
      advertisedDate: new Date().toISOString(),
      priceHistory: [],
    });
    console.log(`New advert added: ${advert.id}`);
  } else {
    // Advert already exists, check for price change
    const existingAdvert = snapshot.val();
    if (existingAdvert.price !== advert.price) {
      // Price change detected
      const priceHistory = existingAdvert.priceHistory || [];
      priceHistory.push({ date: new Date().toISOString(), price: advert.price });

      await ref.update({ price: advert.price, priceHistory });
      console.log(`Price change detected for advert ID ${advert.id}: ${existingAdvert.price} -> ${advert.price}`);
    }
  }
}

async function scrapePaginatedListings() {
  let page = 1;
  let emptyPageCount = 0;

  while (emptyPageCount < 3) {
    console.log(`Fetching URL: https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort&page=${page}`);
    const response = await fetch(`https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort&page=${page}`);
    const html = await response.text();
    const $ = cheerio.load(html);

    const advertContainers = $("article.relative.flex").filter((_, element) => {
      const link = $(element).find("a[href*='/l/']").attr("href");
      const price = $(element).find("h3").text().trim();
      return link && price; // Ensure valid advert with link and price
    });

    const adverts = [];
    advertContainers.each((_, element) => {
      const url = $(element).find("a[href*='/l/']").attr("href");
      const fullUrl = new URL(url, "https://www.carandclassic.com").href;

      if (fullUrl.includes("auctions") || fullUrl.includes("make-an-offer")) {
        console.log(`Skipping advert with URL: ${fullUrl}`);
        return;
      }

      const id = fullUrl.split("/").pop();
      const title = $(element).find("h2").text().trim();
      const price = $(element).find("h3").text().trim();
      const location = $(element).find("span").text().trim();

      adverts.push({ id, url: fullUrl, title, price, location });
    });

    const uniqueAdvertsCount = adverts.length;
    if (uniqueAdvertsCount === 0) {
      console.log(`No adverts found on page ${page}. Empty page count: ${emptyPageCount + 1}/3.`);
      emptyPageCount++;
    } else {
      console.log(`Found ${uniqueAdvertsCount} adverts on page ${page}.`);
      emptyPageCount = 0; // Reset empty page count
      for (const advert of adverts) {
        await saveAdvertData(advert);
      }
    }

    page++;
    console.log("Waiting 10 seconds before fetching the next page...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  console.log("Scraping completed.");
}

scrapePaginatedListings().catch((err) => console.error("Error during scraping:", err));
