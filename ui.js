const state = require('./state');
module.exports = (app) => {
  app.get('/', index);
  app.get('/updates', updater(app));
}

function index(req, res) {
  res.send(`
<h1>apirec</h1>
<dl>
  <dt>mode</dt>
  <dd>${state.mode}</dd>

  <dt>path</dt>
  <dd>${state.PATH}</dd>

  <dt>upstream</dt>
  <dd>${state.upstream}</dd>
</dl>

<form action="/backend/ht" target="responseFrame">
  <button type="submit">GET</button>
  <input type="text" name="path" value="/backend/ht" onchange="this.form.action=this.value">
</form>
<iframe name="responseFrame" style="max-width: 40em; height: 10em;"></iframe>

<h2>Recent requests</h2>
<table>
  <tr>
    <th>URL</th>
    <th>Status</th>
    <th>Response</th>
  </tr>
  <tbody id="tbody">
    ${requestsHTML()}
  </tbody>
</table>
<script>
if (window.EventSource) {
  let source = new EventSource('/updates');
  source.addEventListener('message', function(e) {
    let data = JSON.parse(e.data);
    for (let id in data) {
      document.getElementById(id).innerHTML = data[id];
    }
  }, false);
}
</script>
`);
}

function requestsHTML() {
  return state.REQUESTS.map(req=>`
    <tr>
      <td>${req.url}</td>
      <td>${req.status}</td>
      <td>${req.result}</td>
    </tr>
    `).join('');
}

function updater(app) {
  return (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    app.on('update', () => res.write("data: " + JSON.stringify({tbody: requestsHTML()}) + "\n\n"));
  };
}
