async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function loadQueue() {
  const data = await fetchJSON('/admin/api/queue');
  const alertsEl = document.getElementById('alerts');
  const auditsEl = document.getElementById('audits');
  alertsEl.innerHTML = '';
  auditsEl.innerHTML = '';

  const tpl = document.getElementById('alert-card');
  data.alerts.forEach((alert) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('h3').textContent = `${alert.userId} · score ${alert.score}`;
    node.querySelector('.reason').textContent = alert.reasons.join(', ');
    node.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetchJSON('/admin/api/queue/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId: alert.id, action: btn.dataset.action })
        });
        await loadQueue();
      });
    });
    alertsEl.appendChild(node);
  });

  data.audits.forEach((audit) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<strong>${audit.action}</strong> — ${audit.userId}<br/><span class="reason">${audit.detail}</span><br/><small>${new Date(audit.ts).toLocaleString()}</small>`;
    auditsEl.appendChild(card);
  });
}

document.getElementById('refresh').addEventListener('click', loadQueue);
loadQueue();
