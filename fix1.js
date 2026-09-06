const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');
const lines = c.split('\n');

// Add trailing comma to line 1236 (index 1235)
console.log('before line 1236:', JSON.stringify(lines[1235]));
if (lines[1235].trim() === 'renderModelOptions') {
  lines[1235] = lines[1235] + ',';
  console.log('after line 1236:', JSON.stringify(lines[1235]));
}
c = lines.join('\n');
fs.writeFileSync('app.js', c);
console.log('written, size:', c.length);
