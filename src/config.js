// Ayarlanabilir tüm sayılar burada. Mesafeler aksi belirtilmedikçe omuz genişliği (S) cinsindendir:
// 1.0 = bir omuz genişliği. Böylece kameraya uzaklık sonuçları değiştirmez.

export const CONFIG = {
  camera: {
    width: 1280, // İstenen kamera çözünürlüğü (genişlik, piksel)
    height: 720, // İstenen kamera çözünürlüğü (yükseklik, piksel)
    frameRate: 60, // İstenen kamera kare hızı; kamera desteklemezse daha düşük gelir
  },

  pose: {
    wasmPath: '/mediapipe/wasm', // public/ altına kopyalanan MediaPipe WASM dosyaları
    modelPath: '/models/pose_landmarker_full.task', // Yerel poz modeli (postinstall indirir)
    minPoseDetectionConfidence: 0.5, // İlk kişi tespiti için gereken güven
    minPosePresenceConfidence: 0.5, // Kişinin karede var sayılması için gereken güven
    minTrackingConfidence: 0.5, // Takibin sürmesi için gereken güven (düşükse yeniden tespit eder)
  },

  // One Euro Filter: minCutoff düşükse daha az titreme ama daha çok gecikme;
  // beta yüksekse hızlı harekette gecikme azalır (flap/jump için önemli).
  oneEuro: {
    minCutoff: 1.5, // Hz; durgun anlardaki yumuşatma
    beta: 0.6, // Hıza bağlı kesim artışı
    dCutoff: 1.0, // Hız türevinin kesim frekansı (Hz)
  },

  tracking: {
    visibilityThreshold: 0.5, // Bir eklemin "görünür" sayılması için minimum visibility
    lostTimeoutMs: 500, // Omuz/kalça bu kadar süre görünmezse tracked=false (oyun duraklar)
  },

  // Geçici taban çizgisi (Aşama 2'deki kalibrasyon gelene kadar)
  baseline: {
    captureMs: 1500, // Takip stabil olduktan sonra ayakta duruş ortalaması bu süre boyunca alınır
    maxMotion: 0.08, // Bu süre içinde kalça S'ye göre bu kadardan fazla oynarsa yakalama yeniden başlar
  },

  flap: {
    armUpLevel: -0.2, // armY bunun altına (omuzdan yukarı) çıkınca flap "kurulur"; negatif = omuz üstü
    armDownLevel: 0.35, // Kurulu flap, bilek omuzdan bu kadar aşağı inince tamamlanır
    minDownSpeed: 2.0, // Olay için minimum aşağı hız (S/saniye)
    refAmplitude: 1.6, // strength=1 kabul edilen genlik (S); kalibrasyon bunu kişiye göre ayarlayacak
    refSpeed: 6.0, // strength hesabında tam puan alınan hız (S/saniye)
    cooldownMs: 250, // İki flap olayı arası minimum süre
  },

  glide: {
    armLevelTolerance: 0.45, // Bilek omuz hizasından en fazla bu kadar (S) sapabilir
    minArmSpan: 1.1, // Bilek-omuz yatay uzaklığı en az bu kadar olmalı (kollar açık)
    maxWristSpeed: 1.5, // Bilek hızı bunun altındaysa "sabit" sayılır (S/saniye)
    holdMs: 300, // T-poz bu süre korunursa glide=true
  },

  bank: {
    maxRollDeg: 25, // Omuz hattı bu açıda eğilince açı katkısı 1 olur
    maxShift: 0.35, // Omuz ortası kalça ortasından bu kadar (S) kayınca kayma katkısı 1 olur
    rollWeight: 0.6, // Açı katkısının ağırlığı
    shiftWeight: 0.4, // Yatay kayma katkısının ağırlığı
    deadzone: 0.1, // Bu değerin altındaki |bank| sıfırlanır, üstü yeniden 0..1'e ölçeklenir
  },

  squat: {
    fullDrop: 0.9, // Kalça tabandan bu kadar (S) inince squatDepth=1
    minDrop: 0.08, // Bu düşüşün altı sıfır sayılır (duruş titremesi)
    kneeStraightDeg: 165, // Diz açısı bu değerin üstündeyse squat yok
    kneeDeepDeg: 100, // Diz açısı bu değere inince yedek ölçüm 1 verir
  },

  jump: {
    ankleRise: 0.18, // Ayak bilekleri tabandan bu kadar (S) yükselmeli
    hipRiseSpeed: 1.8, // Kalça yukarı hızı en az bu kadar olmalı (S/saniye)
    hipOnlyRise: 0.3, // Ayak bilekleri görünmüyorsa kalça tabanın bu kadar üstüne çıkmalı
    cooldownMs: 600, // İki zıplama arası minimum süre
  },

  wingsTucked: {
    aboveNose: 0.0, // Bilekler burnun en az bu kadar (S) üstünde olmalı
    maxWristGap: 0.9, // İki bilek arası en fazla bu kadar (S) olmalı
  },

  keyboard: {
    squatDepth: 1.0, // ↓ basılıyken üretilen squat derinliği
    bankValue: 1.0, // ←/→ basılıyken üretilen bank büyüklüğü
    flapStrength: 0.8, // Space ile üretilen flap gücü
  },

  debug: {
    showOnStart: true, // Aşama 1'de debug paneli açık başlar
    uiUpdateMs: 66, // Debug paneli yenileme aralığı (~15 Hz; DOM maliyetini azaltır)
    eventFlashMs: 400, // Flap/jump olayı panelde bu kadar süre vurgulanır
  },

  skeleton: {
    boneColor: '#7fd6ff', // Kemik rengi
    jointColor: '#f5c542', // Eklem rengi
    boneWidth: 4, // Kemik kalınlığı (piksel, tam ekran görünümde)
    jointRadius: 5, // Eklem yarıçapı (piksel)
  },
};
