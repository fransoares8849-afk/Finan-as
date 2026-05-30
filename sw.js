const CACHE = "financas-v5";

self.addEventListener("install", e => { self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ── Push: recebe notificação do servidor ──
self.addEventListener("push", e => {
  let data = { title: "💰 Finanças Pessoais", body: "Você tem contas próximas do vencimento!" };
  try { if (e.data) data = e.data.json(); } catch(_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    "./icon-192.png",
      badge:   "./icon-192.png",
      vibrate: [200, 100, 200],
      tag:     "financas-alerta",
      actions: [{ action:"abrir", title:"Ver contas" }],
      data:    { url: self.location.origin + self.location.pathname }
    })
  );
});

// ── Periodic Background Sync: verifica vencimentos ──
self.addEventListener("periodicsync", e => {
  if (e.tag === "check-vencimentos") {
    e.waitUntil(checkVencimentosSW());
  }
});

async function checkVencimentosSW() {
  try {
    // Ler dados salvos pelo app
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    // Tentar pegar dados via cache/storage
    const cache = await caches.open("financas-notif-data");
    const resp  = await cache.match("notif-data");
    if (!resp) return;
    const { gastos, diasAlerta, mesAtivo } = await resp.json();
    if (!gastos || !diasAlerta) return;

    const hoje  = new Date(); hoje.setHours(0,0,0,0);
    const alertas = gastos.filter(g => {
      if (!g.data) return false;
      const venc = new Date(g.data + "T12:00"); venc.setHours(0,0,0,0);
      const diff = Math.floor((venc - hoje) / 86400000);
      return diff >= 0 && diff <= diasAlerta;
    });

    for (const g of alertas) {
      const venc = new Date(g.data + "T12:00");
      const diff = Math.floor((venc - hoje) / 86400000);
      const quando = diff === 0 ? "HOJE" : "em " + diff + " dia(s)";
      await self.registration.showNotification("⚠️ " + g.desc + " vence " + quando, {
        body:    "R$ " + g.valor.toFixed(2).replace(".", ",") + " — toque para ver no app",
        icon:    "./icon-192.png",
        badge:   "./icon-192.png",
        vibrate: [300, 100, 300],
        tag:     "venc-" + g.id + "-" + diff,
        data:    { url: self.location.origin + self.location.pathname }
      });
    }
  } catch(err) {
    console.log("SW check error:", err);
  }
}

// ── Clique na notificação: abre o app ──
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type:"window", includeUncontrolled:true }).then(clients => {
      const existing = clients.find(c => c.url.includes("Finan-as") || c.url.includes("financas"));
      if (existing) { existing.focus(); return; }
      return self.clients.openWindow(url);
    })
  );
});
