const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_PATH = path.join(__dirname, '..', 'data', 'players.json');
const URL = 'https://raw.githubusercontent.com/kill662477-cmyk/monstarznew/main/data/manual/players.json';

console.log('Downloading players.json from monstarznew...');

https.get(URL, (res) => {
  if (res.statusCode !== 200) {
    console.error('Failed to download players.json, status code: ' + res.statusCode);
    process.exit(1);
  }
  const file = fs.createWriteStream(OUT_PATH);
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Downloaded players.json successfully to ' + OUT_PATH);
  });
}).on('error', (err) => {
  console.error('Error downloading players.json: ', err.message);
  process.exit(1);
});
