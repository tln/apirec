#!/usr/bin/env node
const {app, setMode} = require('./app');

require('fncli')(function (mode='proxy', {port=8888}) {
  setMode(mode);
  app.listen(port, () => console.log(`apirec listening on port ${port}!`))
});
