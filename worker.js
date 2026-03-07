const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

const VEO_API_URL = 'https://veoaifree.com/wp-admin/admin-ajax.php';
const VEO_PAGE_URL = 'https://veoaifree.com/3d-ai-video-generator/';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

let currentNonce = null;
let sessionCookies = '';
let lastNonceResponse = '';

async function fetchFreshNonce() {
    try {
        const res = await axios.get(VEO_PAGE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 10000
        });
        const setCookieHeader = res.headers['set-cookie'];
        if (setCookieHeader) {
            sessionCookies = setCookieHeader.map(c => c.split(';')[0]).join('; ');
        }
        const match = res.data.match(/"nonce":"([a-z0-9]+)"/);
        if (match) {
            currentNonce = match[1];
            lastNonceResponse = `OK - nonce: ${currentNonce}`;
            console.log(`[Nonce] Refreshed: ${currentNonce}`);
        } else {
            lastNonceResponse = `NOT FOUND in response (status: ${res.status})`;
            console.error('[Nonce] Not found in page');
        }
    } catch (err) {
        lastNonceResponse = `ERROR: ${err.message}`;
        console.error('[Nonce] Fetch error:', err.message);
    }
}

fetchFreshNonce();
setInterval(fetchFreshNonce, 10 * 60 * 1000);

function getHeaders(extra = {}) {
    return {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://veoaifree.com/',
        ...(sessionCookies ? { 'Cookie': sessionCookies } : {}),
        ...extra
    };
}

function uploadBufferToCloudinary(buffer, jobId) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'video', folder: 'grokfree-videos', public_id: `video_${jobId}`, overwrite: true },
            (error, result) => { if (error) return reject(error); resolve(result); }
        );
        stream.end(buffer);
    });
}

async function downloadVideoWithPuppeteer(videoUrl) {
    console.log(`[Puppeteer] Launching for URL: ${videoUrl}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    });

    try {
        const page = await browser.newPage();

        // Emulate a realistic browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Referer': 'https://veoaifree.com/',
            'Accept-Language': 'en-US,en;q=0.9'
        });

        console.log(`[Puppeteer] Navigating to video URL...`);

        // Use page.goto and then fetch the response as a buffer
        const response = await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        if (!response || !response.ok()) {
            throw new Error(`Puppeteer failed to load video: ${response ? response.status() : 'No response'}`);
        }

        const buffer = await response.buffer();
        console.log(`[Puppeteer] Successfully downloaded buffer: ${Math.round(buffer.length / 1024)}KB`);
        return buffer;

    } finally {
        await browser.close();
    }
}

async function generateVideo(jobId, prompt, updateCallback) {
    try {
        if (!currentNonce) {
            console.log(`[Job ${jobId}] Nonce not ready, fetching...`);
            await fetchFreshNonce();
        }

        console.log(`[Job ${jobId}] Starting with nonce ${currentNonce}: ${prompt}`);

        const body = new URLSearchParams({
            action: 'veo_video_generator',
            nonce: currentNonce,
            prompt,
            totalVariations: '1',
            aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
            actionType: 'full-video-generate'
        });

        const response = await axios.post(VEO_API_URL, body.toString(), { headers: getHeaders(), timeout: 15000 });
        const sceneDataId = String(response.data).trim();

        console.log(`[Job ${jobId}] SceneData raw response: "${sceneDataId}"`);

        if (!sceneDataId || isNaN(sceneDataId)) {
            return updateCallback({ status: 'failed', error: `Invalid SceneData: "${sceneDataId}"` });
        }

        let videoUrl = null;
        let attempts = 0;

        while (!videoUrl && attempts < 30) {
            console.log(`[Job ${jobId}] Polling attempt ${attempts + 1}...`);
            await new Promise(r => setTimeout(r, 10000));

            const pollBody = new URLSearchParams({
                action: 'veo_video_generator',
                nonce: currentNonce,
                sceneData: sceneDataId,
                actionType: 'final-video-results'
            });

            const pollResponse = await axios.post(VEO_API_URL, pollBody.toString(), { headers: getHeaders() });
            const pollData = pollResponse.data;

            if (pollData && typeof pollData === 'string' && !pollData.includes('empty body')) {
                const idMatch = pollData.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                if (idMatch) {
                    const resultId = idMatch[1].replace(/\s+/g, '');
                    videoUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${resultId}.mp4?cache=1`;
                    console.log(`[Job ${jobId}] Found video URL: "${videoUrl}"`);
                }
            }
            attempts++;
        }

        if (!videoUrl) {
            return updateCallback({ status: 'failed', error: 'Timed out during polling' });
        }

        console.log(`[Job ${jobId}] Downloading video buffer with Puppeteer Stealth...`);
        updateCallback({ status: 'uploading', videoUrl });

        const videoBuffer = await downloadVideoWithPuppeteer(videoUrl);
        console.log(`[Job ${jobId}] Buffer captured. Uploading to Cloudinary...`);

        const uploadResult = await uploadBufferToCloudinary(videoBuffer, jobId);
        console.log(`[Job ${jobId}] Cloudinary URL: ${uploadResult.secure_url}`);

        updateCallback({
            status: 'completed',
            videoUrl,
            downloadUrl: uploadResult.secure_url,
            completedAt: new Date()
        });

    } catch (error) {
        console.error(`[Job ${jobId}] Error:`, error.message);
        updateCallback({ status: 'failed', error: error.message });
    }
}

module.exports = { generateVideo, getNonceStatus: () => ({ nonce: currentNonce, nonceResponse: lastNonceResponse, hasCookies: !!sessionCookies }) };
