import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Helper function to fetch with a timeout
async function fetchWithTimeout(url, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw new Error(`Fetch request to ${url} timed out or failed: ${error.message}`);
  }
}

// Function to save advert data to Firebase
async function saveAdvertData(advertId, advertData) {
  const advertRef = ref(database, `adverts/${advertId}`);
  await set(advertRef, advertData);
  console.log(`Saved advert ID ${advertId} to Firebase.`);
}

// Function to scrape a single page
async function scrapePage(url) {
  console.log(`Fetching URL: ${url}`);
  const response = await fetchWithTimeout(url, 30000); // Allow up to 30 seconds for the page to load
  const html = await response.text();
  const $ = cheerio.load(html);

  const adverts = [];
  const seenAdverts = new Set();

  $('.relative.flex').each((index, element) => {
    const link = $(element).find('a').attr('href');
    if (!link || typeof link !== 'string') {
      console.warn(`Skipping advert with missing or invalid URL`);
      return; // Skip if URL is missing or invalid
    }

    // Exclude adverts with "auctions" or "make-an-offer" in the URL
    if (link.includes('auctions') || link.includes('make-an-offer')) {
      console.warn(`Skipping advert with URL: ${link}`);
      return;
    }

    const idMatch = link.match(/\/car\/([a-zA-Z0-9]+)/);
    if (!idMatch || !idMatch[1] || seenAdverts.has(idMatch[1])) {
      console.warn(`Skipping advert with ID: ${idMatch ? idMatch[1] : 'undefined'} (already processed or invalid)`);
      return; // Skip if no valid ID or already processed advert
    }

    const id = idMatch[1];
    seenAdverts.add(id); // Add the advert ID to the set to avoid reprocessing

    const title = $(element).find('h2').text().trim();
    const price = $(element).find('h3').text().trim();
    const location = $(element).find('.text-xs.font-semibold.leading-4').text().trim();

    adverts.push({
      id,
      title,
      price,
      location,
      advertisedDate: new Date().toISOString(),
    });
  });

  return adverts;
}

// Function to scrape paginated listings
async function scrapePaginatedListings() {
  console.log('Scraping paginated listings...');
  const baseUrl = `https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort`;
  let page = 1;
  let consecutiveEmptyPages = 0;

  while (consecutiveEmptyPages < 3) {
    const url = `${baseUrl}&page=${page}`;
    let reloadAttempts = 0;
    let adverts = [];

    while (reloadAttempts < 3) {
      try {
        adverts = await scrapePage(url);

        if (adverts.length > 0) {
          break; // Stop reloading if adverts are found
        }

        console.log(`No adverts found on page ${page}. Retrying (${reloadAttempts + 1}/3)...`);
        reloadAttempts++;
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        reloadAttempts++;
      }
    }

    if (adverts.length === 0) {
      console.log(`No adverts found on page ${page} after 3 attempts. Moving to next page.`);
      consecutiveEmptyPages++;
    } else {
      consecutiveEmptyPages = 0; // Reset counter if adverts are found
      for (const advert of adverts) {
        await saveAdvertData(advert.id, advert);
      }
      console.log(`Processed page ${page} with ${adverts.length} adverts.`);
    }

    page++; // Move to the next page

    // Add delay between page requests to avoid overloading the server
    console.log('Waiting 10 seconds before fetching the next page...');
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10-second delay
  }

  console.log('Scraping completed.');
}

// Main execution
scrapePaginatedListings()
  .then(() => {
    console.log('Scraper completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Scraper encountered an error:', error);
    process.exit(1);
  });
