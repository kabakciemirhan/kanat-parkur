# Kanat: Hava Parkuru

Webcam karşısında tüm vücutla oynanan, tarayıcıda çalışan 3D egzersiz oyunu (Three.js + MediaPipe PoseLandmarker).

## Kurulum

```bash
npm install      # postinstall: MediaPipe WASM'ı kopyalar, poz modelini indirir
npm run dev      # http://localhost:5173 (Chrome)
```

Model veya WASM eksikse: `npm run setup-assets`.

## Kontroller (Aşama 1)

| Hareket | Klavye yedeği |
|---|---|
| Kolları aşağı çırp (flap) | Space |
| T-poz (süzülme) | — |
| Gövdeyi yana eğ (bank) | ← / → |
| Squat | ↓ |
| Zıpla | ↑ |
| Kolları başın üstünde birleştir | T |

`D` debug panelini açar/kapatır, `R` ayakta duruş tabanını yeniden alır.

## Gizlilik

Tüm görüntü işleme cihazda yapılır; kamera görüntüsü kaydedilmez ve hiçbir yere gönderilmez.
