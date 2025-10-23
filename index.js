const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("baileys");
const pino = require("pino");

// Ganti ke nomor kamu (tanpa +)
const nomorOwner = "6282218221162";

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false, // pairing code
    auth: state,
    browser: ["Nuxzz Bot", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, pairingCode } = update;

    if (pairingCode) console.log("🔢 Pairing code:", pairingCode);

    if (connection === "open") console.log("✅ Bot terhubung");
    else if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔁 Terputus, reconnecting...");
        startBot();
      } else console.log("❌ Logout permanen, hapus auth_info lalu login ulang.");
    } else if (!state.creds.registered) {
      const code = await sock.requestPairingCode(nomorOwner);
      console.log(`🔢 Kode pairing kamu: ${code}`);
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      const senderNumber = (sender || "").split("@")[0];
      const isOwner = senderNumber === nomorOwner;
      const isGroup = from && from.endsWith("@g.us");

      // === Command .kickall ===
      if (isGroup && text.trim() === ".kickall" && isOwner) {
        const botId = sock.user.id;
        const botJid = botId.includes(":")
          ? botId.split(":")[0] + "@s.whatsapp.net"
          : botId;

        const meta = await sock.groupMetadata(from);
        const participants = meta.participants || [];

        const meParticipant = participants.find((p) => p.id === botJid);
        const botIsAdmin =
          meParticipant?.admin === "admin" || meParticipant?.admin === "superadmin";

        if (!botIsAdmin) {
          await sock.sendMessage(from, {
            text: "⚠️ Saya harus dijadikan admin dulu untuk mengeluarkan member.",
          });
          return;
        }

        const toRemove = participants
          .map((p) => p.id)
          .filter((id) => id !== botJid && id !== sender);

        const total = toRemove.length;
        const BATCH = 5;
        const DELAY = 1200; // 1.2 detik jeda antar batch

        await sock.sendMessage(from, {
          text: `🚨 Memulai proses .kickall (${total} anggota)...\nPer batch: ${BATCH}, jeda: ${DELAY / 1000}s`,
        });

        for (let i = 0; i < toRemove.length; i += BATCH) {
          const batch = toRemove.slice(i, i + BATCH);
          try {
            await sock.groupParticipantsUpdate(from, batch, "remove");
            const done = Math.min(i + BATCH, total);
            await sock.sendMessage(from, {
              text: `🧹 Keluarin anjing ${done}/${total} anggota...`,
            });
          } catch (err) {
            console.error("Gagal batch:", err);
          }
          await new Promise((r) => setTimeout(r, DELAY)); // jeda antar batch
        }

        await sock.sendMessage(from, {
          text: "✅ SSee ya  jangan culik lagi ya! #Xnet #ShadowX #Blukutuk2024 t).",
        });
      }

      // === Contoh balasan biasa ===
      if (text.toLowerCase() === "halo") {
        await sock.sendMessage(from, { text: "Hai! Bot aktif 😎" });
      }
    } catch (e) {
      console.error("messages.upsert error:", e);
    }
  });
}

startBot();
