import fetch from 'node-fetch';
import cheerio from 'cheerio';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Firebase setup
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://car-price-tracker-e0a6b-default-rtdb.firebaseio.com',
  });
}

const db = admin.database();
const baseUrl = 'https://www.carandclassic.com/search?listing_type_ex=advert&sort=latest&source=modal-sort';

async function scrapePaginatedListings() {
  let page = 1;
  let emptyPageCount = 0;

  while (emptyPageCount < 3) {
    const url = `${baseUrl}&page=${page}`;
    console.log(`Fetching URL: ${url}`);

    try {
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);

      const adverts = [];
      $('article.relative.flex').each((_, element) => {
        const advertUrl = $(element).find('a').attr('href');
        if (!advertUrl || advertUrl.includes('auctions') || advertUrl.includes('make-an-offer')) return;

        const advertId = advertUrl.split('/').pop();
        const title = $(element).find('h2').text().trim();
        const price = $(element).find('h3').text().trim();
        const location = $(element).find('span.text-xs.font-semibold').text().trim();

        adverts.push({ advertId, title, price, location });
      });

      if (adverts.length === 0) {
        console.log('No adverts found on the page.');
        emptyPageCount++;
      } else {
        emptyPageCount = 0;
        console.log(`Found ${adverts.length} adverts.`);
        for (const advert of adverts) {
          await saveAdvertData(advert);
        }
      }

      console.log(`Processed page ${page} with ${adverts.length} adverts.`);
      page++;
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds between pages
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  console.log('Scraping completed.');
}

async function saveAdvertData(advert) {
  const advertRef = db.ref(`/adverts/${advert.advertId}`);
  const snapshot = await advertRef.once('value');
  const existingAdvert = snapshot.val();

  if (existingAdvert) {
    if (existingAdvert.price !== advert.price) {
      console.log(`Price change detected for advert ID ${advert.advertId}: ${existingAdvert.price} -> ${advert.price}`);
      const priceHistory = existingAdvert.priceHistory || [];
      priceHistory.push({
        date: new Date().toLocaleDateString('en-GB'), // DD/MM/YYYY format
        price: advert.price,
      });
      await advertRef.update({ price: advert.price, priceHistory });
    } else {
      console.log(`No price change for advert ID ${advert.advertId}`);
    }
  } else {
    console.log(`New advert added: ${advert.advertId}`);
    const advertisedDate = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY format
    await advertRef.set({
      ...advert,
      advertisedDate,
      priceHistory: [{ date: advertisedDate, price: advert.price }],
    });
  }
}

scrapePaginatedListings();
