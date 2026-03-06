// Use native fetch and URLSearchParams

async function testVeoAPI() {
    const url = 'https://veoaifree.com/wp-admin/admin-ajax.php';
    const nonce = 'e696f82c15';

    console.log("Starting video generation API test...");

    const body = new URLSearchParams();
    body.append('action', 'veo_video_generator');
    body.append('nonce', nonce);
    body.append('prompt', 'A beautiful sunset over the mountains, 4k resolution');
    body.append('totalVariations', '1');
    body.append('aspectRatio', 'VIDEO_ASPECT_RATIO_LANDSCAPE');
    body.append('actionType', 'full-video-generate');

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: body,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        const text = await response.text();
        console.log("Response from server (SceneData ID):", text);

        console.log("Polling for final video result...");
        let text2 = "empty body";
        let attempts = 0;

        while (text2.includes("empty body") && attempts < 10) {
            console.log(`Waiting 10 seconds... (Attempt ${attempts + 1}/10)`);
            await new Promise(r => setTimeout(r, 10000));

            const body2 = new URLSearchParams();
            body2.append('action', 'veo_video_generator');
            body2.append('nonce', nonce);
            body2.append('sceneData', text);
            body2.append('actionType', 'final-video-results');

            const response2 = await fetch(url, {
                method: 'POST',
                body: body2,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });
            text2 = await response2.text();
            console.log("Video Data Response:", text2);
            attempts++;
        }

        if (!text2.includes("empty body")) {
            let id = text2.split('/').pop();
            let finalUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${id}.mp4?cache=1`;
            console.log("Final Video URL:", finalUrl);
        } else {
            console.log("Timed out waiting for video.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

testVeoAPI();
