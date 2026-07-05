const fs = require('fs');
const html = fs.readFileSync('C:/Users/silve/OneDrive/Desktop/tiertable/index.html', 'utf8');
const lines = html.split('\n');
const target = '654785012_5LWEHZIq_1b65ee331f3d15182ad494519730802c7a63a8d3.jpg';
for(const line of lines) {
    if(line.includes(target)) console.log(line.trim());
}
