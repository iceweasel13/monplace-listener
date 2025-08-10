// src/listener.ts
import "dotenv/config";
import { createPublicClient, http, webSocket, Transport } from "viem";
import { monadTestnet } from "viem/chains";
import { contractAddress, contractAbi } from "./contract";
import { adminDb } from "./firebase-admin";

if (!process.env.FIREBASE_PROJECT_ID || !process.env.MONAD_RPC_URL || !process.env.CONTRACT_ADDRESS) {
  console.error("HATA: Gerekli ortam değişkenleri eksik. .env dosyasını kontrol edin.");
  process.exit(1);
}

const useWss = !!process.env.MONAD_WSS_RPC_URL;
const transport = useWss
  ? webSocket(process.env.MONAD_WSS_RPC_URL)
  : http(process.env.MONAD_RPC_URL);

console.log(`Listener başlatılıyor (${useWss ? "WebSocket" : "HTTP Polling"} modu)...`);

const client = createPublicClient({
  chain: monadTestnet,
  transport: transport,
});

async function main() {
  console.log(`Akıllı kontrat dinleniyor: ${contractAddress}`);

  client.watchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: "PixelPainted",
    pollingInterval: useWss ? undefined : 2000,
    onLogs: (logs) => {
      console.log(`[Olay Yakalandı] ${logs.length} yeni piksel boyandı.`);
      for (const log of logs) {
        const { x, y, colorIndex, paintedBy } = log.args;

        if (x === undefined || y === undefined || colorIndex === undefined) {
          console.error("[HATA] Gelen olay verisi eksik:", log.args);
          continue;
        }

        const pixelId = `${x}-${y}`;
        const pixelRef = adminDb.collection("pixels").doc(pixelId);

        pixelRef.set({ x, y, colorIndex, updated_by: paintedBy })
          .then(() => console.log(`Firestore güncellendi: Piksel (${pixelId}) | Boyayan: ${paintedBy}`))
          .catch((error) => console.error(`[HATA] Firestore güncelleme hatası, piksel ${pixelId}:`, error));
      }
    },
    onError: (error) => console.error("[HATA] Olay dinleyicide sorun oluştu:", error.message),
  });

  console.log("... Canlı olaylar bekleniyor ...");
}

main().catch((error) => {
  console.error("[KRİTİK HATA] Listener başlatılamadı:", error);
  process.exit(1);
});