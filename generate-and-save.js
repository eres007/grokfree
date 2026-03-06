const https = require('https');
const fs = require('fs');

const url = 'https://veoaifree.com/wp-admin/admin-ajax.php';
const nonce = 'e696f82c15';
const outputPath = 'cyber_lion.mp4';
const prompt = 'Majestic cybernetic lion in a neon cityscape, 4k cinematic';

async function generateAndDownload() {
    console.log(`Starting video generation for: "${prompt}"...`);

    const body = new URLSearchParams();
    body.append('action', 'veo_video_generator');
    body.append('nonce', nonce);
    body.append('prompt', prompt);
    body.append('totalVariations', '1');
    body.append('aspectRatio', 'VIDEO_ASPECT_RATIO_LANDSCAPE');
    body.append('actionType', 'full-video-generate');

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: body,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://veoaifree.com/'
            }
        });

        const sceneDataId = await response.text();
        console.log("Response from server (SceneData ID):", sceneDataId);

        if (!sceneDataId || isNaN(sceneDataId)) {
            console.error("Invalid SceneData ID received:", sceneDataId);
            return;
        }

        console.log("Polling for final video result...");
        let videoUrlResponse = "empty body";
        let attempts = 0;
        const maxAttempts = 20;

        while (videoUrlResponse.includes("empty body") && attempts < maxAttempts) {
            console.log(`Waiting 5 seconds... (Attempt ${attempts + 1}/${maxAttempts})`);
            await new Promise(r => setTimeout(r, 5000));

            const pollBody = new URLSearchParams();
            pollBody.append('action', 'veo_video_generator');
            pollBody.append('nonce', nonce);
            pollBody.append('sceneData', sceneDataId);
            pollBody.append('actionType', 'final-video-results');

            const pollResponse = await fetch(url, {
                method: 'POST',
                body: pollBody,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://veoaifree.com/'
                }
            });
            videoUrlResponse = await pollResponse.text();
            console.log("Video Data Response:", videoUrlResponse);
            attempts++;
        }

        if (!videoUrlResponse.includes("empty body")) {
            // The response might be a full URL or just a Grok link.
            // We need to extract the ID and build the public share URL.
            const idMatch = videoUrlResponse.match(/post\/([a-zA-Z0-9-]+)/);
            const id = idMatch ? idMatch[1] : videoUrlResponse.split('/').pop().replace('.mp4', '');

            const finalUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${id}.mp4?cache=1`;
            console.log("Found Video URL:", finalUrl);

            console.log(`Downloading video to ${outputPath}...`);
            await downloadFile(finalUrl, outputPath);
            console.log("Download completed successfully! File saved as:", outputPath);
        } else {
            console.log("Timed out waiting for video generation.");
        }
    } catch (e) {
        console.error("Error during generation/download:", e);
    }
}

function downloadFile(fileUrl, destPath) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://veoaifree.com/',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            }
        };

        https.get(fileUrl, options, (res) => {
            if (res.statusCode !== 200) {
                // If it's a redirect, handle it
                if (res.statusCode === 301 || res.statusCode === 302) {
                    console.log("Redirected to:", res.headers.location);
                    return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
                }
                reject(new Error(`Failed to download: status ${res.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });

            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => reject(err));
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

generateAndDownload();
