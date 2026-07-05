const fs = require('fs');
const html = fs.readFileSync('C:/Users/silve/OneDrive/Desktop/tiertable/index.html', 'utf8');

const getUrl = name => {
    const regex = new RegExp('"' + name + '": "(.*?)"');
    const match = html.match(regex);
    return match ? match[1] : 'NOT FOUND';
};

console.log('지두두:', getUrl('지두두'));
console.log('뚜비:', getUrl('뚜비'));
console.log('햄희:', getUrl('햄희'));
