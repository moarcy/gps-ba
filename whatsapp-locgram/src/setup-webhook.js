import { evolutionConfig, evolutionFetch } from "./evolution-client.js";

function payloads(webhookUrl) {
  const events = ["MESSAGES_UPSERT", "messages.upsert"];
  return [
    {
      path: "/webhook/set/{instance}",
      body: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT"],
      },
    },
    {
      path: "/webhook/set/{instance}",
      body: {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ["MESSAGES_UPSERT"],
        },
      },
    },
    {
      path: "/webhook/{instance}",
      body: { url: webhookUrl, enabled: true, events },
    },
    {
      path: "/webhook/instance/{instance}",
      body: { url: webhookUrl, enabled: true, events },
    },
  ];
}

async function main() {
  const { instance, webhookUrl, base, key } = evolutionConfig();
  if (!key || !instance) {
    throw new Error("Preencha EVOLUTION_API_KEY e EVOLUTION_INSTANCE no whatsapp-locgram/.env");
  }
  console.log(`Evolution ${base} instância ${instance}`);
  console.log(`Webhook Locgram → ${webhookUrl}`);
  console.log("Evento: MESSAGES_UPSERT (só Nova ocorrência entra no sistema).");
  console.log("Não envia mensagem. Não marca Sim/Não.");

  let lastErr = null;
  for (const attempt of payloads(webhookUrl)) {
    try {
      const result = await evolutionFetch(attempt.path, { method: "POST", body: attempt.body });
      console.log(`Webhook Locgram registrado em ${attempt.path}`);
      console.log(JSON.stringify(result, null, 2).slice(0, 800));
      return;
    } catch (err) {
      lastErr = err;
      console.log(`Tentativa ${attempt.path} falhou (${err.status || "?"}).`);
    }
  }
  throw lastErr || new Error("Não conseguiu registrar o webhook.");
}

main().catch((err) => {
  console.error(err.message || err);
  console.error("");
  console.error("A Evolution precisa estar ligada neste PC.");
  console.error("Porta 8080 neste notebook é do Telegram Radar — Evolution usa outra porta.");
  console.error("Se ela roda em Docker, use EVOLUTION_WEBHOOK_URL=http://host.docker.internal:8790/webhook");
  process.exit(1);
});
