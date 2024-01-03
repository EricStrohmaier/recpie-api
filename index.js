const express = require('express');
const puppeteerExtra = require('puppeteer-extra');
const puppeteer = require('puppeteer-core');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const app = express();
const port = 3002; // Set your desired port

puppeteerExtra.use(StealthPlugin());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const urls = Array.from({ length: 105 }, (v, i) => `https://pinchofyum.com/recipes/all/page/${i + 1}`);

async function scrapeData() {
  let browser;

  try {
    browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });

    const page = await browser.newPage();

    // Set navigation timeout to 60 seconds (60000 milliseconds)
    await page.setDefaultNavigationTimeout(60000);

    const scrapedData = [];

    for (const url of urls) {
      await page.goto(url);
      const articles = await page.$$('article');

      for (const article of articles) {
        const link = await article.$eval('a.block', (element) => element.getAttribute('href'));

        const category = await page.evaluate((article) => {
          const excludedCategories = [
            'category-sos-series',
            'category-soup',
            'category-quinoa',
            'category-healthy-choices',
            'category-january-meal-planning-bootcamp',
            'category-casserole',
            'category-legume',
            'category-avocado',
            'category-dairy-free',
            'category-the-soup-series',
            'category-holiday-series',
            'category-meal-prep',
            'category-life',
            'category-5-ingredients',
            'category-recipes',
            'category-all',
          ];

          const classList = Array.from(article.classList);

          return classList
            .filter((c) => c.startsWith('category-') && !excludedCategories.includes(c))
            .map((c) => c.substring(9));
        }, article);

        const title = await article.$eval('h3', (element) => element.textContent.trim() || 'No title');
        //if src is empty, put in placeholder
        const imgElement = await article.$('img');
        const src = imgElement ? await imgElement.evaluate((img) => img.getAttribute('src')) : 'https://via.placeholder.com/200x200';

        if (category.length > 0) {
            const existingRecord = await supabase
              .from('recipes')
              .select('link')
              .eq('link', link)
              .single();
      
            // if (!existingRecord || (existingRecord && existingRecord.link !== link)) {
            //   // If the record doesn't exist or the link is different, insert the new data
            //   const data = { link, title, category, src };
            //   scrapedData.push(data);
      
            //   const { _, error } = await supabase.from('recipes').insert([
            //     { link: link, title: title, category: category, src: src },
            //   ]);              console.log('data',data);
            //   console.log(error);
            // }
            if (!existingRecord) {
                // If the record doesn't exist, insert the new data
                const data = { link, title, category, src };
                scrapedData.push(data);
          
                const { data: insertedData, error } = await supabase.from('recipes').insert([data]);
                console.log('Inserted data:', insertedData);
                console.log('Error:', error);
              }
        }
      }
    }

    return scrapedData;
  } catch (e) {
    console.error('Scraping failed', e);
  } finally {
    await browser?.close();
  }
}

// Endpoint to trigger scraping
app.get('/scrape', async (req, res) => {
  try {
    const scrapedData = await scrapeData();
    res.status(200).json(scrapedData);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to retrieve scraped data
app.get('/recipes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('recipes').select();
    if (error) {
      console.error('Supabase error:', error);
      res.status(500).send('Internal Server Error');
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Start the Express.js server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
