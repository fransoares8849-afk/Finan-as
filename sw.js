const CACHE = "financas-v19";

self.addEventListener("install", e => { self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
  // Verificar vencimentos ao ativar o SW
  verificarEAgendar();
});

self.addEventListener("fetch", e => {
  e.respondWith(fetch(e.request).catch(() => new Response("offline")));
  // Aproveitar cada requisição para verificar se precisa notificar
  verificarEAgendar();
});

// ── Periodic Background Sync ──
self.addEventListener("periodicsync", e => {
  if (e.tag === "check-vencimentos") e.waitUntil(verificarEAgendar());
});

// ── Push recebido do servidor ──
self.addEventListener("push", e => {
  let data = { title:"💰 Finanças Pessoais", body:"Você tem contas próximas do vencimento!" };
  try { if (e.data) data = e.data.json(); } catch(_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, icon:"./icon-192.png", badge:"./icon-192.png",
      vibrate:[200,100,200], tag:"financas-push",
      data:{ url: self.location.origin + self.location.pathname }
    })
  );
});

// ── Clique na notificação ──
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({type:"window", includeUncontrolled:true}).then(clients => {
      const found = clients.find(c => c.url.includes("Finan"));
      if (found) return found.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ── Verificar vencimentos e agendar notificação diária ──
async function verificarEAgendar() {
  try {
    const cache = await caches.open("financas-notif-data");

    // Verificar se é hora de mostrar notificação diária
    const agendaResp = await cache.match("notif-agenda");
    if (agendaResp) {
      const agenda = await agendaResp.json();
      const agora = Date.now();
      if (agora >= agenda.proximaNotif) {
        // Hora de verificar!
        await checarVencimentos(cache);
        // Agendar próxima notificação (amanhã mesma hora)
        const proximaNotif = agora + 24 * 60 * 60 * 1000;
        await cache.put("notif-agenda", new Response(JSON.stringify({ proximaNotif })));
      }
    }
  } catch(err) {}
}

async function checarVencimentos(cache) {
  try {
    const resp = await cache.match("notif-data");
    if (!resp) return;
    const { gastos, diasAlerta, pagamentos } = await resp.json();
    if (!gastos || !diasAlerta) return;

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const alertas = (gastos || []).filter(g => {
      if (!g.data) return false;
      // Verificar se já está pago (pagamentos[mesAtivo][id])
      const venc = new Date(g.data + "T12:00"); venc.setHours(0,0,0,0);
      const diff = Math.floor((venc - hoje) / 86400000);
      return diff >= 0 && diff <= diasAlerta;
    });

    if (alertas.length === 0) return;

    const lista = alertas.map(g => {
      const venc = new Date(g.data+"T12:00");
      const diff  = Math.floor((venc - hoje) / 86400000);
      return g.desc + (diff === 0 ? " (HOJE)" : " (em " + diff + " dia" + (diff>1?"s":"") + ")");
    }).join(", ");

    await self.registration.showNotification(
      "⚠️ " + alertas.length + " conta" + (alertas.length>1?"s":"") + " próxima" + (alertas.length>1?"s":"") + " do vencimento",
      {
        body: lista,
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        vibrate: [300, 100, 300, 100, 300],
        tag: "venc-diario",
        requireInteraction: true,
        data: { url: self.location.origin + self.location.pathname }
      }
    );
  } catch(err) {}
}
