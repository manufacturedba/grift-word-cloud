const fs = require('fs');
const { google } = require('googleapis');
const { resolve } = require('path');
const base64url = require('base64url');
const flatten = require('flatten');
const { decode } = require('html-entities');
const isUrl = require('is-url');

const TOKEN_PATH = 'token.json';

const LABEL_NAME = 'dumbshit';

const MAX_RESULTS = 500;

const MIME_TYPE = 'text/plain';

/**
* Get the bad emails
*
*/
function getPresLabel(client) {
  return new Promise(function(resolve, reject) {
    client.users.labels.list({
      userId: 'me',
    }, (err, res) => {
      if (err) return console.log('The API returned an error: ' + err);
      const labels = res.data.labels;
      if (labels.length) {
        const { id } = labels.find((label) => label.name === LABEL_NAME);  
        if (!id) {
          reject('Cannot find matching label');
        } else {
          resolve(id);
        }
      } else {
        reject('No labels found');
      }
    });
  });
}

function getEmailList(client, id) {
  return new Promise(function(resolve, reject) {
    client.users.messages.list({
      userId: 'me',
      labelIds: [id],
      maxResults: MAX_RESULTS,
    }, (err, res) => {
      if (err) {
        reject('Unable to read emails');
      } else {
        resolve(res.data.messages);
      }
    });
  });
}

/**
 * You might want to sit down for this one
 */
function readEmails(client, messages) {
  // Test run of 1
  // return Promise.all([
  //   new Promise(function(resolve, reject) {
  //     client.users.messages.get({
  //       userId: 'me',
  //       id: messages[0].id
  //     }, (err, res) => {
  //       if (err) {
  //         return reject(`Unable to get message: ${messages[0].id}`);
  //       }

  //       resolve(res.data.payload.parts.find(part => part.mimeType === MIME_TYPE));
  //     });
  //   })]);

  return Promise.all(messages.map((message) => {
    return new Promise(function(resolve, reject) {
      client.users.messages.get({
        userId: 'me',
        id: message.id
      }, (err, res) => {
        if (err) {
          console.error(err);
          return reject(`Unable to get message: ${message.id}`);
        }

        resolve(res.data.payload.parts.find(part => part.mimeType === MIME_TYPE));
      });
    });
  }));
}

// Do not break up URLs and the like
const preSymbols = ['<', '\n', '\r', ',', '!'];

// URLs are removed so feel free to strip
const postSymbols = ['“', '*', '=', /\.$/, '?', '(', ')', '>>', ':', '”'];

function stupidRemove(text, symbol) {
  return text.split(symbol).join(' ');
}

function parseContents(contents) {
  const decodedText = flatten(contents.map((content) => {
    if (content) {
      // Trash newlines and split into words

      const decodedString = decode(base64url.decode(content.body.data));
      return preSymbols.reduce((acc, symbol) => {
        return stupidRemove(acc, symbol);
      }, decodedString).split(' ');
    } else {
      return [''];
    }
  }));

  fs.readFile('blacklist.json', function(err, res) {
    if (err) {
      console.error('Could not read blacklist');
    } else {
      const wordCount = {};
      const blacklist = JSON.parse(res);

      // Drop any empty spaces, word matches, or URLs
      const filteredText = decodedText.filter(text => text && !blacklist.includes(text.toLowerCase()) && !isUrl(text));

      // Finish off any remaining punctuation
      processedText = filteredText.map((text) => {
        return postSymbols.reduce((acc, symbol) => {
          return stupidRemove(acc, symbol);
        }, text)
      });
      
      processedText.forEach((word) => {
        const normalized = word.toLowerCase().trim();
        if (!wordCount[normalized]) {
          wordCount[normalized] = 0;
        }

        wordCount[normalized]++;
      });

      fs.writeFile('wordcount.json', JSON.stringify(wordCount, null, 4), function(err) {
        if (err) {
          console.error(err);
        }
      });
    }
  });
}

/**
* Create an OAuth2 client with the given credentials, and then execute the
* given callback function.
* @param {Object} credentials The authorization client credentials.
* @param {function} callback The callback to call with the authorized client.
*/
function authorize(credentials) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);
  
  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    oAuth2Client.setCredentials(JSON.parse(token));
    const gmail = google.gmail({version: 'v1', auth: oAuth2Client});
    getPresLabel(gmail)
    .then((id) => getEmailList(gmail, id))
    .then(emailList => readEmails(gmail, emailList))
    .then(contents => parseContents(contents));
  });
}

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Gmail API.
  authorize(JSON.parse(content));
});