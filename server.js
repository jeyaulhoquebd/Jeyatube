const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static assets with support for .html extensions
app.use(express.static(path.join(__dirname, '.'), {
  extensions: ['html', 'htm']
}));

// Route fallback for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback to index.html for unrecognized routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`JTube server running at http://0.0.0.0:${PORT}`);
});
