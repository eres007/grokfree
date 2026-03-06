const express = require('express');
const { generateVideo, getJobStatus } = require('./worker');
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

app.get('/', (req, res) => {
    res.send('Veo/Grok Video Automation API is running.');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
