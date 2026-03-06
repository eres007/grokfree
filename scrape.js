const scraper = require('website-scraper');
const scrape = scraper.default || scraper;

const options = {
    urls: ['https://veoaifree.com/3d-ai-video-generator/'],
    directory: './site',
};

console.log("Starting to scrape https://veoaifree.com/3d-ai-video-generator/...");

scrape(options).then((result) => {
    console.log("Entire website succesfully downloaded!");
}).catch((err) => {
    console.error("An error ocurred", err);
});
