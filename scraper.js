const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set } = require('firebase/database');

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

// Function to save advert data to Firebase
async function saveAdvertData(advertId, advertData) {
  const advertRef = ref(database, `adverts/${advertId}`);
  await set(advertRef, advertData);
  console.log(`Saved advert ID ${advertId} to Firebase.`);
}

// Function to scrape a single page
async function scrapePage(url) {
  console.log(`Fetching URL: ${url}`);
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);

  const adverts = [];

  $('.relative.flex').each((index, element) => {
    const id = $(element).find('a').attr('href').split('/car/')[1];
    const title = $(element).find('h2').text().trim();
    const price = $(element).find('h3').text().trim();
    const location = $(element).find('.text-xs.font-semibold.leading-4').text().trim();

    if (id) {
      adverts.push({
        id,
        title,
        price,
        location,
        advertisedDate: new Date().toISOString(),
      });
    }
  });

  return adverts;
}

// Function to scrape all paginated listings
async function scrapePaginatedListings() {
  console.log('Scraping paginated listings...');
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const url = `https://www.carandclassic.com/search?listing_type_ex=advert&page=${page}&sort=latest&source=modal-sort`;
    const adverts = await scrapePage(url);

    if (adverts.length === 0) {
      console.log(`No adverts found on page ${page}. Stopping pagination.`);
      hasMorePages = false;
    } else {
      for (const advert of adverts) {
        await saveAdvertData(advert.id, advert);
      }
      console.log(`Processed page ${page} with ${adverts.length} adverts.`);
      page += 1;
    }

    // Add delay between page requests to avoid overloading the server
    await new Promise((resolve) => setTimeout(resolve, 10000));
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
