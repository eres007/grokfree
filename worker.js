const axios = require('axios');
const cloudinary = require('cloudinary').v2;

const VEO_API_URL = 'https://veoaifree.com/wp-admin/admin-ajax.php';
const NONCE = 'e696f82c15';

// Configure Cloudinary from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function generateVideo(jobId, prompt, updateCallback) {
    try {
        console.log(`[Job ${jobId}] Starting generation: ${prompt}`);

        const body = new URLSearchParams();
        body.append('action', 'veo_video_generator');
        body.append('nonce', NONCE);
        body.append('prompt', prompt);
        body.append('totalVariations', '1');
        body.append('aspectRatio', 'VIDEO_ASPECT_RATIO_LANDSCAPE');
        body.append('actionType', 'full-video-generate');

        const response = await axios.post(VEO_API_URL, body.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://veoaifree.com/'
            }
        });

        const sceneDataId = response.data;
        if (!sceneDataId || isNaN(sceneDataId)) {
            throw new Error(`Invalid SceneData received: ${sceneDataId}`);
        }

        // Polling loop
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 30;

        while (!videoUrl && attempts < maxAttempts) {
            console.log(`[Job ${jobId}] Polling attempt ${attempts + 1}...`);
            await new Promise(r => setTimeout(r, 5000));

            const pollBody = new URLSearchParams();
            pollBody.append('action', 'veo_video_generator');
            pollBody.append('nonce', NONCE);
            pollBody.append('sceneData', sceneDataId);
            pollBody.append('actionType', 'final-video-results');

            const pollResponse = await axios.post(VEO_API_URL, pollBody.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://veoaifree.com/'
                }
            });

            const pollData = pollResponse.data;
            if (pollData && typeof pollData === 'string' && !pollData.includes('empty body')) {
                const cleanedData = pollData.trim();
                const idMatch = cleanedData.match(/post\/([a-zA-Z0-9-]+)/);
                let resultId = idMatch ? idMatch[1] : cleanedData.split('/').pop().split('?')[0].replace('.mp4', '');

                if (resultId) {
                    resultId = resultId.replace(/\s+/g, '');
                    videoUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${resultId}.mp4?cache=1`;
                    console.log(`[Job ${jobId}] Found video URL: "${videoUrl}"`);
                }
            }
            attempts++;
        }

        if (videoUrl) {
            // Upload to Cloudinary immediately — bypasses Grok CDN IP block
            console.log(`[Job ${jobId}] Uploading to Cloudinary...`);
            updateCallback({ status: 'uploading', videoUrl });

            const uploadResult = await cloudinary.uploader.upload(videoUrl, {
                resource_type: 'video',
                folder: 'grokfree-videos',
                public_id: `video_${jobId}`,
                overwrite: true
            });

            const cloudinaryUrl = uploadResult.secure_url;
            console.log(`[Job ${jobId}] Cloudinary upload complete: ${cloudinaryUrl}`);

            updateCallback({
                status: 'completed',
                videoUrl,         // original Grok URL (for reference)
                downloadUrl: cloudinaryUrl,  // permanent Cloudinary URL
                completedAt: new Date()
            });
        } else {
            updateCallback({ status: 'failed', error: 'Timed out during polling' });
        }

    } catch (error) {
        console.error(`[Job ${jobId}] Error:`, error.message);
        updateCallback({ status: 'failed', error: error.message });
    }
}

module.exports = { generateVideo };
