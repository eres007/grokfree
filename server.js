const express = require('express');
const axios = require('axios');
const { generateVideo } = require('./worker');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// In-memory job store (for Render ephemeral storage)
const jobs = new Map();

app.post('/generate', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const jobId = Date.now().toString();
    jobs.set(jobId, { status: 'pending', prompt, createdAt: new Date() });

    // Trigger generation asynchronously
    generateVideo(jobId, prompt, (statusData) => {
        jobs.set(jobId, { ...jobs.get(jobId), ...statusData });
    });

    res.json({ jobId, message: 'Generation started' });
});

app.get('/status/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

app.get('/download/:id', async (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.status !== 'completed') {
        return res.status(404).send('Video not ready or job not found');
    }

    try {
        console.log(`Proxying download for job ${req.params.id}: "${job.videoUrl}"`);

        const response = await axios({
            method: 'get',
            url: job.videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://veoaifree.com/',
                'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="video_${req.params.id}.mp4"`);
        response.data.pipe(res);
    } catch (error) {
        console.error('Download proxy error:', error.message);
        res.status(500).send(`Failed to proxy video download: ${error.message} - URL: ${job.videoUrl}`);
    }
});

app.get('/', (req, res) => {
    res.send('Veo/Grok Video Automation API is running.');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
