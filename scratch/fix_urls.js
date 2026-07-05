const fs = require('fs');
let html = fs.readFileSync('C:/Users/silve/OneDrive/Desktop/tiertable/index.html', 'utf8');

const replacements = {
  '지두두': 'https://eloboard.com/women/data/file/bj_list/654785012_5LWEHZIq_1b65ee331f3d15182ad494519730802c7a63a8d3.jpg',
  '뚜비': 'https://eloboard.com/women/data/file/bj_list/2950633312_iOHntuXJ_9d76eb73257aa5257913043d4db075bec4608985.jpg',
  '햄희': 'https://eloboard.com/women/data/file/bj_list/1850093361_aKONu8GT_9256db9f3dae9b2c2ae4cff67963e25c745e837c.jpg'
};

for (const name in replacements) {
    const regex = new RegExp('"' + name + '":\\s*".*?"');
    html = html.replace(regex, '"' + name + '": "' + replacements[name] + '"');
}

fs.writeFileSync('C:/Users/silve/OneDrive/Desktop/tiertable/index.html', html);
console.log('Fixed URLs');
