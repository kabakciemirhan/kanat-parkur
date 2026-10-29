# Kanat: Hava Parkuru

Webcam karşısında tüm vücutla oynanan, tarayıcıda çalışan 3D egzersiz oyunu (Three.js + MediaPipe PoseLandmarker).

## Kurulum

```bash
npm install      # postinstall: MediaPipe WASM'ı kopyalar, poz modelini indirir
npm run dev      # http://localhost:5173 (Chrome)
```

Model veya WASM eksikse: `npm run setup-assets`.

## Kalibrasyon (~15 sn)

Açılışta `Enter` ile başlar: dik duruş → T-poz → 3 kez kanat çırpma → rahat bir squat → hafif bir zıplama.
Sonuçlar tarayıcıda (localStorage) saklanır; sonraki açılışlarda `S` ile atlanabilir. `C` kalibrasyonu yeniden başlatır.
Bir adım 12 saniyede tamamlanmazsa o hareket için varsayılan eşikler kullanılır.

## Kontroller

| Hareket | Klavye yedeği |
|---|---|
| Kolları aşağı çırp (flap) | Space |
| T-poz (süzülme) | — |
| Gövdeyi yana eğ (bank) | ← / → |
| Squat | ↓ |
| Zıpla | ↑ |
| Kolları başın üstünde birleştir | T |

`D` debug panelini açar/kapatır, `R` ayakta duruş tabanını yeniden alır, `C` kalibrasyonu yeniden başlatır.

## Gizlilik

Tüm görüntü işleme cihazda yapılır; kamera görüntüsü kaydedilmez ve hiçbir yere gönderilmez.
