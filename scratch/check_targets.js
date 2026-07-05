const fs = require('fs');
const html = fs.readFileSync('C:/Users/silve/OneDrive/Desktop/tiertable/index.html', 'utf8');
const lines = html.split('\n');
const targets = [
  '654785012_5LWEHZIq_1b65ee331f3d15182ad494519730802c7a63a8d3.jpg',
  '2950634172_Y5Ux6Hlf_9bc9dce9519568c6bd7b1eec31f210f1ffbbcc4e.jpg',
  '2950630191_Vk7JY2Fv_94313b6164951252fd03f898922537608c796fc4.jpg',
  '2950632891_y2JC7pUG_a5dc3294da36c5d46e3be149c8eb37336841d1f1.jpg',
  '2950633468_gzJhlyNK_a7bc8734b3cfff10173f8448e83fc39ad89cf77b.jpg',
  '2950631095_mPRujBv5_b364d0fb2f8273bfc2e4c7d470c9ee32b6c0404a.jpg',
  '2523616559_kc7xedqX_11b52e87934e6e578999199a3c88fff1bd4e7d96.jpg',
  '2950631549_6r9aumVM_f67fe0fa854cb7fb249e62167fcb1f26ef8924f5.jpg'
];

for(const line of lines) {
    for(const target of targets) {
        if(line.includes(target)) {
            console.log(line.trim());
        }
    }
}
