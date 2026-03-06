const axios = require('axios');

const VEO_API_URL = 'https://veoaifree.com/wp-admin/admin-ajax.php';
const NONCE = 'e696f82c15';

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
                    // Remove ALL whitespace and newlines from the ID
                    resultId = resultId.replace(/\s+/g, '');
                    videoUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${resultId}.mp4?cache=1`;
                }
            }
            attempts++;
        }

        if (videoUrl) {
            updateCallback({
                status: 'completed',
                videoUrl,
                downloadUrl: `/download/${jobId}`,
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
