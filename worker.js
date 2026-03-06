const axios = require('axios');
const cloudinary = require('cloudinary').v2;

const VEO_API_URL = 'https://veoaifree.com/wp-admin/admin-ajax.php';
const VEO_PAGE_URL = 'https://veoaifree.com/3d-ai-video-generator/';

// Configure Cloudinary from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Nonce + cookies cache — refreshed on startup and every 10 minutes
let currentNonce = null;
let sessionCookies = '';

async function fetchFreshNonce() {
    try {
        const res = await axios.get(VEO_PAGE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        // Capture session cookies
        const setCookieHeader = res.headers['set-cookie'];
        if (setCookieHeader) {
            sessionCookies = setCookieHeader.map(c => c.split(';')[0]).join('; ');
        }
        const match = res.data.match(/"nonce":"([a-z0-9]+)"/);
        if (match) {
            currentNonce = match[1];
            console.log(`[Nonce] Refreshed: ${currentNonce}`);
        } else {
            throw new Error('Nonce not found in page');
        }
    } catch (err) {
        console.error('[Nonce] Failed to refresh:', err.message);
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

// Upload a video buffer to Cloudinary
function uploadBufferToCloudinary(buffer, jobId) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'video',
                folder: 'grokfree-videos',
                public_id: `video_${jobId}`,
                overwrite: true
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        uploadStream.end(buffer);
    });
}

async function generateVideo(jobId, prompt, updateCallback) {
    try {
        if (!currentNonce) {
            await fetchFreshNonce();
        }

        console.log(`[Job ${jobId}] Starting with nonce ${currentNonce}: ${prompt}`);

        const body = new URLSearchParams();
        body.append('action', 'veo_video_generator');
        body.append('nonce', currentNonce);
        body.append('prompt', prompt);
        body.append('totalVariations', '1');
        body.append('aspectRatio', 'VIDEO_ASPECT_RATIO_LANDSCAPE');
        body.append('actionType', 'full-video-generate');

        const response = await axios.post(VEO_API_URL, body.toString(), { headers: getHeaders() });

        const sceneDataId = String(response.data).trim();
        if (!sceneDataId || isNaN(sceneDataId)) {
            throw new Error(`Invalid SceneData received: ${sceneDataId}`);
        }

        console.log(`[Job ${jobId}] SceneData ID: ${sceneDataId}`);

        // Polling loop
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 30;

        while (!videoUrl && attempts < maxAttempts) {
            console.log(`[Job ${jobId}] Polling attempt ${attempts + 1}...`);
            await new Promise(r => setTimeout(r, 5000));

            const pollBody = new URLSearchParams();
            pollBody.append('action', 'veo_video_generator');
            pollBody.append('nonce', currentNonce);
            pollBody.append('sceneData', sceneDataId);
            pollBody.append('actionType', 'final-video-results');

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

        // Download video buffer on this server using session cookies
        console.log(`[Job ${jobId}] Downloading video buffer...`);
        updateCallback({ status: 'uploading', videoUrl });

        const videoResponse = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://veoaifree.com/',
                'Accept': 'video/webm,video/ogg,video/*;q=0.9,*/*;q=0.5',
                ...(sessionCookies ? { 'Cookie': sessionCookies } : {})
            }
        });

        const videoBuffer = Buffer.from(videoResponse.data);
        console.log(`[Job ${jobId}] Downloaded ${Math.round(videoBuffer.length / 1024)}KB. Uploading to Cloudinary...`);

        const uploadResult = await uploadBufferToCloudinary(videoBuffer, jobId);
        const cloudinaryUrl = uploadResult.secure_url;
        console.log(`[Job ${jobId}] Cloudinary URL: ${cloudinaryUrl}`);

        updateCallback({
            status: 'completed',
            videoUrl,
            downloadUrl: cloudinaryUrl,
            completedAt: new Date()
        });

    } catch (error) {
        console.error(`[Job ${jobId}] Error:`, error.message);
        updateCallback({ status: 'failed', error: error.message });
    }
}

module.exports = { generateVideo };
