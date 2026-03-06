const https = require('https');
const fs = require('fs');

const url = "https://imagine-public.x.ai/imagine-public/share-videos/57693e8e-bf16-448f-9fcc-403f254edc8c.mp4?cache=1";
const path = "sunset_video.mp4";

console.log(`Downloading ${url} to ${path}...`);

const options = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://veoaifree.com/',
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5'
    }
};

const request = https.get(url, options, function (response) {
    if (response.statusCode !== 200) {
        console.error(`Failed to download: status ${response.statusCode}`);
        if (response.statusCode === 302 || response.statusCode === 301) {
            console.log(`Redirecting to: ${response.headers.location}`);
        }
        return;
    }

    const file = fs.createWriteStream(path);
    response.pipe(file);

    file.on('finish', function () {
        file.close();
        console.log("Download completed successfully.");
    });

}).on('error', function (err) {
    console.error("Error downloading file: ", err.message);
});
