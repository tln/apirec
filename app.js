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
    let reqInfo = extractReqInfo(req)
    let log = createContext(reqInfo);
    log('In progress', req.path, MODE.name);

    let resp;
    if (MODE.useSaved) resp = await findSaved(reqInfo, log);
    if (!resp) {
      if (MODE.useBackend) {
        resp = await getBackendRes(reqInfo, log);
        await saveResp(resp, reqInfo, log);
      } else {
        return sendError(res, reqInfo, log);
      }
    }
    sendResp(res, resp, log);
  })().then(next);
});

function extractReqInfo(req) {
  let {method, path, headers, body, query} = req;
  headers = filterHeaders(headers);
  return {method, headers, path, data: method === 'GET' ? query : body};
}

function createContext(reqInfo) {
  let ctx = {reqInfo, status: ''};
  state.REQUESTS.push(ctx);
  return (status, ...rest) => {
    console.log(status, ...rest);
    ctx.status = status;
    app.emit('update');
  }
}

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
    hash.update(req.data);
    variant = '-sha256:' + hash.digest('hex');
  }
  return join('_saved', req.path + '/' + req.method + variant + '.json');
}

async function findSaved(reqInfo, log) {
  const path = staticPath(reqInfo);
  log('Looking', path);
  let json;
  try {
    json = await readFile(path, 'utf-8');
    log('Found');
  } catch(e) {
    log('Not found', e);
    return null;
  }
  let {status, headers, body} = JSON.parse(json);
  return {status, headers, body};
}

const axios = require('axios');
async function getBackendRes(reqInfo, log) {
  let {path, method, headers, data} = reqInfo;
  let datakey = method === 'GET' ? 'params' : 'data';
  let url = state.upstream + path;

  log('Fetching', method, url, headers, datakey, data);
  let resp = await axios({
    url,
    method,
    headers,
    [datakey]: data,
    timeout: 15000, // TODO this should be configurable
    validateStatus: null,
  });
  log('Got response', resp.status);
  return {status: resp.status, headers: resp.headers, body: resp.data};
}

function sendResp(res, resp, log) {
  res.status(resp.status);
  res.set(resp.headers);
  res.send(resp.body);
}

async function saveResp(resp, reqInfo, log) {
  if (MODE.saveRequests) {
    let path = staticPath(reqInfo);
    if (MODE.saveIfExists || !(await exists(path))) {
      await saveRequest(resp, reqInfo, path, log);
    }
  }
}

async function saveRequest(resp, reqInfo, path, log) {
  log('Saving');

  fs.mkdirSync(dirname(path), { recursive: true });

  let reqBody = reqInfo.data;
  if (Buffer.isBuffer(reqBody)) {
    // Ensure buffer serializes nicely
    reqBody = reqBody.toString();
  } else if (typeof reqBody == 'object' && Object.keys(reqBody).length == 0) {
    // Empty set of params. Serialize as "no body".
    reqBody = undefined;
  }

  await writeFile(path, JSON.stringify({
    req: {body: reqBody},
    status: resp.status,
    headers: resp.headers,
    body: resp.body
  }, null, 4));

  log('Saved');
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
