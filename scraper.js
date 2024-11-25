import cheerio from 'cheerio';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };

// Firebase initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://car-price-tracker-e0a6b-default-rtdb.firebaseio.com',
  });
}

const db = admin.database();

async function scrapePaginatedListings(startingUrl) {
  let page = 1;
  let consecutiveEmptyPages = 0;

  while (consecutiveEmptyPages < 3) {
    const url = `${startingUrl}&page=${page}`;
    console.log(`Fetching URL: ${url}`);
    try {
      const response = await fetch(url, { timeout: 30000 });
      const html = await response.text();
      const $ = cheerio.load(html);

      const adverts = [];
      $('article a').each((_, element) => {
        const advertUrl = $(element).attr('href');
        if (advertUrl && !advertUrl.includes('auctions') && !advertUrl.includes('make-an-offer')) {
          const advertId = advertUrl.split('/').pop();
          const price = $(element).find('h3').text().trim();
          const location = $(element).find('span').text().trim();
          adverts.push({ advertId, advertUrl, price, location });
        }
      });

      if (adverts.length === 0) {
        console.log(`No adverts found on the page. Empty page detected (${consecutiveEmptyPages + 1}/3).`);
        consecutiveEmptyPages++;
      } else {
        console.log(`Found ${adverts.length} adverts.`);
        consecutiveEmptyPages = 0; // Reset empty pages counter
        await processAdverts(adverts);
      }

      page++;
      console.log('Waiting 10 seconds before fetching the next page...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      consecutiveEmptyPages++;
    }
  }

  console.log('Scraping completed.');
}

async function processAdverts(adverts) {
  for (const advert of adverts) {
    const advertRef = db.ref(`adverts/${advert.advertId}`);
    const snapshot = await advertRef.once('value');
    const existingData = snapshot.val();

    if (existingData) {
      if (existingData.price !== advert.price) {
        console.log(`Price change detected for advert ID ${advert.advertId}: ${existingData.price} -> ${advert.price}`);
        if (!existingData.priceHistory) {
          existingData.priceHistory = [];
        }
        existingData.priceHistory.push({
          price: advert.price,
          date: new Date().toISOString(),
        });

        await advertRef.update({
          price: advert.price,
          priceHistory: existingData.priceHistory,
        });
      } else {
        console.log(`No price change for advert ID ${advert.advertId}`);
      }
    } else {
      console.log(`New advert added: ${advert.advertId}`);
      await advertRef.set({
        advertId: advert.advertId,
        url: advert.advertUrl,
        price: advert.price,
        location: advert.location,
        advertisedDate: new Date().toISOString(),
        priceHistory: [],
      });
    }
  }
}

// Start the scraper
const startingUrl = 'https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort';
scrapePaginatedListings(startingUrl);
