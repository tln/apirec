const express = require('express');
const app = express();
exports.app = app;
const bodyParser = require('body-parser')
app.use(bodyParser.raw({type: '*/*', limit: '10mb'}));

const state = require('./state');

require('./ui')(app);

/**
 * Handle the requests to the upstream,
 * using the mode in question.
 */
app.all(state.PATH+'/*', (req, res, next) => {
  (async () => {
    console.log(req.path, MODE);
    let reqInfo = {method: req.method, url: req.path, status: 'In progress'};
    state.REQUESTS.push(reqInfo)
    app.emit('update');

    let found = MODE.useSaved && await sendSaved(req, res, reqInfo);
    console.log(found);
    if (!found) {
      if (MODE.useBackend) {
        await sendBackendRes(req, res, reqInfo, MODE.saveRequests, MODE.saveIfExists);
      } else {
        await sendError(req, res, reqInfo);
      }
    }
  })().then(next);
});

const {promisify} = require('util');
const fs = require('fs');
const exists = promisify(fs.exists);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const {join, dirname} = require('path');
const crypto = require('crypto');

function staticPath(req) {
  // TODO handle numbers -> :id
  // TODO use "http" or "mime" format?
  let variant = '';
  if (req.method != 'GET' && req.method != 'OPTIONS') {
    const hash = crypto.createHash('sha256');
    hash.update(req.body);
    variant = '-sha256:' + hash.digest('hex');
  }
  return join(__dirname, '..', '_saved', req.path + '/' + req.method + variant + '.json');
}

async function sendSaved(req, res, reqInfo) {
  const path = staticPath(req);
  reqInfo.status = 'Looking';
  app.emit('update');
  let json;
  try {
    json = await readFile(path, 'utf-8');
  } catch(e) {
    console.log(e);
    return false;
  }
  let {status, headers, body} = JSON.parse(json);
  reqInfo.status = 'Sent static';
  app.emit('update');

  res.status(status);
  res.set(headers);
  res.send(body);
  return true;
}

const axios = require('axios');
async function sendBackendRes(req, res, reqInfo, save, saveIfExists) {
  // TODO contact backend...
  let url = state.upstream + req.path;
  let headers = filterHeaders(req.headers);
  console.log('fetching', req.method, url, req.headers, req.body);
  let resp = await axios({
    url,
    method: req.method,
    headers,
    data: req.body,
    timeout: 15000, // TODO this should be configurable
    validateStatus: null,
  });
  console.log('got resp', resp.status);
  let body = resp.data;
  console.log('got', body);
  reqInfo.status = 'Got response';
  app.emit('update');

  headers = resp.headers;
  console.log(headers);
  res.status(resp.status);
  res.set(headers);
  res.send(body);

  if (save) {
    let path = staticPath(req);
    if (!saveIfExists || !(await exists(path))) {
      await saveRequest(reqInfo, path, req, resp.status, headers, body);
    }
  }
}

async function saveRequest(reqInfo, path, req, status, headers, body) {
  reqInfo.status = 'Saving';
  app.emit('update');

  fs.mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    req: {body: req.body},
    status,
    headers,
    body
  }, null, 4));

  reqInfo.status = 'Saved';
  app.emit('update');
}

function filterHeaders(headers) {
  headers = Object.assign(headers);
  headers.accept = 'application/json';
  delete headers.host;
  return headers;
}

async function sendError(req, res) {
  // TODO
}

exports.setMode = function setMode(mode) {
  state.mode = mode
  if (!(mode in MODES)) throw `Invalid mode, pass one of ${Object.keys(MODES).join(' ')}`;
  MODE = MODES[mode];
  MODE.name = mode;
}

const MODES = {
  standalone: {
    useSaved: true,
    useBackend: false,
    desc: 'use saved requests for all requests. error if missing requests.'
  },
  proxy: {
    useSaved: false,
    useBackend: true,
    saveRequests: true,
    saveIfExists: false,
    desc: 'contact backend for all requests. save missing requests.'
  },
  update: {
    useSaved: false,
    useBackend: true,
    saveRequests: true,
    saveIfExists: true,
    desc: 'contact backend for all requests. save all requests.'
  },
  refresh: {
    useSaved: true,
    useBackend: true,
    saveRequests: true,
    desc: 'use saved request for all requests. contact backend and save missing requests.'
  }
};
let MODE = MODES.proxy;
                                                                                                                                                                                      