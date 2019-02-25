const express = require('express');
const app = express()

app.get('/', (req, res) => res.send('Hello World!'))

app.all('/backend', (req, res, next) => {
  (async () => {
    let found = MODE.useSaved && await sendSaved(req, res);
    if (!found) {
      if (fallbackToBackend) {
        await sendBackendRes(req, res, MODE.saveRequests, MODE.saveIfExists);
      } else {
        await sendError(req, res);
      }
    }
  })().then(next);
});

const {promisify} = require('util');
const fs = require('fs');
const {exists} = promisify(fs.exists);
const {join} = require('path');

function staticPath(res) {
  // TODO add method...
  // TODO handle numbers -> :id
  return join(__dirname, '..', 'static/backend', res.path + '.json');
}

async function sendSaved(req, res) {
  const path = staticPath(req);
  if (exists(path)) {
    res.sendFile(path));
    return true;
  } else {
    return false;
  }
}

async function saveRes(req, res) {
  // TODO save res
}

async function sendBackendRes(req, res, save, saveIfExists) {
  // TODO contact backend...
  // TODO save request
}

async function sendError(req, res) {
  // TODO
}

function setMode(mode) {
  if (!(mode in MODES)) throw `Invalid mode, pass one of ${Object.keys(MODES).join(' ')}`;
  MODE = MODES[mode];
  MODE.name = mode;
}
let MODE = 'proxy';
const MODES = {
  standalone: {
    useSaved: true,
    fallbackToBackend: false,
    desc: 'use saved requests for all requests. error if missing requests.'
  },
  proxy: {
    useSaved: false,
    saveRequests: true,
    saveIfExists: true,
    desc: 'contact backend for all requests. save missing requests.'
  },
  update: {
    useSaved: false,
    saveRequests: true,
    saveIfExists: true,
    desc: 'contact backend for all requests. save all requests.'
  },
  refresh: {
    useSaved: true,
    fallbackToBackend: true,
    saveRequests: true,
    desc: 'use saved request for all requests. contact backend and save missing requests.'
  }
};

require('fncli')(function (mode='proxy', {port=8888}) {
  setMode(mode);
  app.listen(port, () => console.log(`Example app listening on port ${port}!`))
});
