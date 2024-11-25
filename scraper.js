import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// Format date to DD/MM/YYYY
function formatDateToDDMMYYYY(date) {
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Date(date).toLocaleDateString('en-GB', options);
}

// Save advert data to Firebase
async function saveAdvertData(advertId, advertData) {
  const advertRef = ref(database, `adverts/${advertId}`);
  const existingAdvertSnapshot = await get(advertRef);
  const existingAdvert = existingAdvertSnapshot.val();

  if (!existingAdvert) {
    // New advert detected
    advertData.advertisedDate = formatDateToDDMMYYYY(new Date());
    advertData.priceHistory = [];
    await set(advertRef, advertData);
    console.log(`New advert added: ${advertId}`);
  } else {
    // Existing advert - Check for price change
    if (existingAdvert.price !== advertData.price) {
      console.log(`Price change detected for advert ID ${advertId}: ${existingAdvert.price} -> ${advertData.price}`);
      const priceChange = {
        date: formatDateToDDMMYYYY(new Date()),
        price: advertData.price,
      };
      existingAdvert.priceHistory.push(priceChange);
      await update(advertRef, { price: advertData.price, priceHistory: existingAdvert.priceHistory });
    } else {
      console.log(`No price change for advert ID ${advertId}`);
    }
  }
}

// Scrape a single page
async function scrapePage(url) {
  console.log(`Fetching URL: ${url}`);
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const adverts = [];
    $('article.relative.flex').each((_, element) => {
      const container = $(element);

      const advertUrl = container.find('a').first().attr('href');
      const advertId = advertUrl ? advertUrl.split('/').pop() : null;
      const advertTitle = container.find('h2').text().trim();
      const advertPrice = container.find('h3').first().text().trim();
      const advertLocation = container.find('span').first().text().trim();

      if (!advertUrl || !advertId) {
        console.log('Skipping advert with missing URL or ID.');
        return;
      }

      if (advertUrl.includes('auctions') || advertUrl.includes('make-an-offer')) {
        console.log(`Skipping out-of-scope advert: ${advertUrl}`);
        return;
      }

      adverts.push({
        id: advertId,
        url: advertUrl,
        title: advertTitle,
        price: advertPrice,
        location: advertLocation,
      });
    });

    console.log(`Found ${adverts.length} adverts.`);
    return adverts;
  } catch (error) {
    console.error(`Error fetching page: ${error.message}`);
    return [];
  }
}

// Scrape paginated listings
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
      emptyPageCount = 0;
      for (const advert of adverts) {
        await saveAdvertData(advert.id, advert);
      }
    }

    console.log(`Processed page ${page} with ${adverts.length} adverts.`);
    page++;
    console.log('Waiting 10 seconds before fetching the next page...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  console.log('Scraping completed.');
}

const startingUrl = 'https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort';
console.log('Scraping paginated listings...');
scrapePaginatedListings(startingUrl).catch((error) => {
  console.error('Error during scraping:', error);
});
