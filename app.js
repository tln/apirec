const express = require('express');
const app = express();
exports.app = app;
const bodyParser = require('body-parser')
app.use(bodyParser.raw());

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

function staticPath(res) {
  // TODO handle numbers -> :id
  // TODO use "http" or "mime" format?
  return join(__dirname, '_saved', res.path + '/' + res.method + '.json');
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
  let {headers, body} = JSON.parse(json);
  reqInfo.status = 'Sent static';
  app.emit('update');

  res.set(headers);
  res.send(body);
  return true;
}

const {default: fetch} = require('node-fetch');
async function sendBackendRes(req, res, reqInfo, save, saveIfExists) {
  // TODO contact backend...
  let url = state.upstream + req.path;
  let headers = filterHeaders(req.headers);
  console.log('fetching', req.method, url, req.headers, req.body);
  let resp = await fetch(url, {
    method: req.method,
    headers,
    body: req.body,
    follow: 0,
    timeout: 5000,
  });
  console.log('got resp', resp);
  let body = await resp.text();
  console.log('got', body);
  reqInfo.status = 'Got response';
  app.emit('update');

  // TODO unless we save headers we shouldn't send the server headers here
  headers = {}
  resp.headers.forEach((v, k) => headers[k] = v);
  console.log(headers);
  res.set(headers);
  res.send(body);

  if (save) {
    let path = staticPath(req);
    if (!saveIfExists || !(await exists(path))) {
      await saveRequest(reqInfo, headers, path, body);
    }
  }
}

async function saveRequest(reqInfo, headers, path, body) {
  reqInfo.status = 'Saving';
  app.emit('update');

  fs.mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({headers, body}, null, 4));

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
                                                                                                                                                                                      