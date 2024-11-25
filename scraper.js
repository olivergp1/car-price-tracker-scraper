import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, update } from 'firebase/database';
import cheerio from 'cheerio';

// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// Format date to DD/MM/YYYY
function formatDateToDDMMYYYY(date) {
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Date(date).toLocaleDateString('en-GB', options); // en-GB for DD/MM/YYYY
}

// Save advert data to Firebase
async function saveAdvertData(advertId, advertData) {
  const advertRef = ref(database, `adverts/${advertId}`);
  const existingAdvert = (await get(advertRef)).val();

  if (!existingAdvert) {
    // If the advert doesn't exist in Firebase, add it
    advertData.advertisedDate = formatDateToDDMMYYYY(new Date()); // Set advertisedDate with formatted date
    advertData.priceHistory = []; // Initialize priceHistory as an empty array
    await set(advertRef, advertData);
    console.log(`New advert added: ${advertId}`);
  } else {
    // If the advert exists, check for price changes
    if (existingAdvert.price !== advertData.price) {
      console.log(`Price change detected for advert ID ${advertId}: ${existingAdvert.price} -> ${advertData.price}`);
      // Update the current price
      const updatedData = {
        price: advertData.price,
      };
      // Add the price change to priceHistory
      const priceChange = {
        date: formatDateToDDMMYYYY(new Date()), // Format to DD/MM/YYYY
        price: advertData.price,
      };
      existingAdvert.priceHistory.push(priceChange);
      updatedData.priceHistory = existingAdvert.priceHistory;
      await update(advertRef, updatedData);
    } else {
      console.log(`No price change for advert ID ${advertId}`);
    }
  }
}

// Scrape a single page of adverts
async function scrapePage(url) {
  console.log(`Fetching URL: ${url}`);
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const advertContainers = $('.advert-container');
    if (advertContainers.length === 0) {
      console.log('No adverts found on the page.');
      return [];
    }

    const adverts = [];
    advertContainers.each((_, element) => {
      const container = $(element);
      const advertUrl = container.find('a').attr('href');
      const advertId = container.data('id');
      const advertPrice = container.find('.price').text().trim();
      const advertLocation = container.find('.location').text().trim();

      if (!advertUrl || !advertId) {
        console.log('Skipping advert with missing URL or ID.');
        return;
      }

      // Filter out "auctions" and "make-an-offer" adverts
      if (advertUrl.includes('auctions') || advertUrl.includes('make-an-offer')) {
        console.log(`Skipping out-of-scope advert: ${advertUrl}`);
        return;
      }

      adverts.push({
        id: advertId,
        url: advertUrl,
        price: advertPrice,
        location: advertLocation,
      });
    });

    return adverts;
  } catch (error) {
    console.error(`Error fetching page: ${error.message}`);
    return [];
  }
}

// Scrape all paginated listings
async function scrapePaginatedListings(startingUrl) {
  let page = 1;
  let emptyPageCount = 0;

  while (emptyPageCount < 3) {
    const url = `${startingUrl}&page=${page}`;
    const adverts = await scrapePage(url);

    if (adverts.length === 0) {
      emptyPageCount++;
      console.log(`Empty page detected (${emptyPageCount}/3).`);
    } else {
      emptyPageCount = 0; // Reset empty page count if adverts are found
      for (const advert of adverts) {
        await saveAdvertData(advert.id, advert);
      }
    }

    console.log(`Processed page ${page} with ${adverts.length} adverts.`);
    page++;
    console.log('Waiting 10 seconds before fetching the next page...');
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds between pages
  }

  console.log('Scraping completed.');
}

// Entry point
const startingUrl = 'https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort';
console.log('Scraping paginated listings...');
scrapePaginatedListings(startingUrl).catch((error) => {
  console.error('Error during scraping:', error);
});
