// Dumb as hell
const fs = require('fs');

fs.readFile('wordcount.json', function(err, res) {
  if (err) {
    console.error(err);
  }

  const contents = JSON.parse(res);

  Object.keys(contents).forEach(function(key) {
    const plural = key + 's';
    if (contents[plural]) {
      contents[key] += contents[plural];
      delete contents[plural];
    }
  });

  console.log(contents);
})