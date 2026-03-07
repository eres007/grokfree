const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
            lastNonceResponse = `OK - ${currentNonce}`;
        }
    } catch (err) {
        lastNonceResponse = `ERROR: ${err.message}`;
    }
}

fetchFreshNonce();
setInterval(fetchFreshNonce, 10 * 60 * 1000);

async function downloadAndUploadToCloudinary(jobId, videoUrl, updateCallback) {
    console.log(`[Job ${jobId}] Launching Low-Memory Puppeteer Stealth...`);
    // Debug: Find chromium
    let foundPath = null;
    try {
        const findCmd = 'find /opt/render/project/src/.cache/puppeteer -name "chrome" -type f -perm /u+x | head -n 1';
        foundPath = execSync(findCmd).toString().trim();
        console.log(`[Debug] Found Chrome at: "${foundPath}"`);
    } catch (e) {
        console.log(`[Debug] Find command failed: ${e.message}`);
    }

    const launchArgs = {
        headless: "new",
        executablePath: foundPath || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions'
        ]
    };

    console.log(`[Job ${jobId}] Launching with executablePath: ${launchArgs.executablePath}`);
    const browser = await puppeteer.launch(launchArgs);

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`[Job ${jobId}] Capturing video via Puppeteer...`);
        const response = await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        if (!response || !response.ok()) {
            throw new Error(`Failed to load video: ${response ? response.status() : 'No response'}`);
        }

        // Use buffer for Cloudinary. We try to keeping it local to save RAM.
        const buffer = await response.buffer();
        console.log(`[Job ${jobId}] Buffer size: ${Math.round(buffer.length / 1024)}KB. Uploading...`);

        await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { resource_type: 'video', folder: 'grokfree-videos', public_id: `video_${jobId}`, overwrite: true },
                (error, result) => {
                    if (error) return reject(error);
                    updateCallback({
                        status: 'completed',
                        videoUrl,
                        downloadUrl: result.secure_url,
                        completedAt: new Date()
                    });
                    resolve();
                }
            );
            stream.end(buffer);
        });

    } finally {
        await browser.close();
    }
}

async function generateVideo(jobId, prompt, updateCallback) {
    try {
        if (!currentNonce) await fetchFreshNonce();

        const body = new URLSearchParams({
            action: 'veo_video_generator',
            nonce: currentNonce,
            prompt,
            totalVariations: '1',
            aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
            actionType: 'full-video-generate'
        });

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://veoaifree.com/',
            ...(sessionCookies ? { 'Cookie': sessionCookies } : {})
        };

        const response = await axios.post(VEO_API_URL, body.toString(), { headers, timeout: 15000 });
        const sceneDataId = String(response.data).trim();

        if (!sceneDataId || isNaN(sceneDataId)) {
            return updateCallback({ status: 'failed', error: `Invalid SceneData: "${sceneDataId}"` });
        }

        let videoUrl = null;
        let attempts = 0;
        while (!videoUrl && attempts < 30) {
            await new Promise(r => setTimeout(r, 10000));
            const pollBody = new URLSearchParams({
                action: 'veo_video_generator',
                nonce: currentNonce,
                sceneData: sceneDataId,
                actionType: 'final-video-results'
            });

            const pollRes = await axios.post(VEO_API_URL, pollBody.toString(), { headers });
            const pollData = pollRes.data;

            if (pollData && typeof pollData === 'string' && !pollData.includes('empty body')) {
                const match = pollData.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                if (match) {
                    videoUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${match[1].replace(/\s+/g, '')}.mp4?cache=1`;
                }
            }
            attempts++;
        }

        if (!videoUrl) return updateCallback({ status: 'failed', error: 'Timed out' });

        updateCallback({ status: 'uploading', videoUrl });
        await downloadAndUploadToCloudinary(jobId, videoUrl, updateCallback);

    } catch (error) {
        updateCallback({ status: 'failed', error: error.message });
    }
}

module.exports = { generateVideo, getNonceStatus: () => ({ nonce: currentNonce, nonceResponse: lastNonceResponse, hasCookies: !!sessionCookies }) };
