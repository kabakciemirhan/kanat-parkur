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
    neutralArmY: 0, // Kişinin T-pozdaki bilek seviyesi (omuza göre); kalibrasyon ölçer
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

  // Kalibrasyon akışı: her adımın süreleri ve ölçümden eşik türetme oranları
  calibration: {
    storageKey: 'kanat.calibration.v1', // localStorage anahtarı
    readyHoldMs: 1000, // Tüm vücut bu süre görünür kalınca kalibrasyon başlar
    standHoldMs: 2000, // Ayakta, kollar yanda ölçüm süresi
    tPoseHoldMs: 1500, // T-poz ölçüm süresi
    flapCycles: 3, // Ölçülecek kol kaldır-indir tekrarı
    stepTimeoutMs: 12000, // Bir adım bu sürede tamamlanmazsa varsayılan değerlerle geçilir
    doneScreenMs: 5000, // Özet ekranı bu süre sonra otomatik kapanır (uzaktayken tıklamak zor)
    maxStandMotion: 0.1, // Ayakta ölçümde kalça bu kadar (S) oynarsa ölçüm yeniden başlar

    // Algılama seviyeleri (kalibrasyon sırasında kullanılır; bilerek gevşek)
    armsDownLevel: 0.8, // armY bunun üstündeyse kollar yanda sayılır
    tPoseLevelTol: 0.7, // T-poz için bileğin omuz hizasından max sapması (S)
    tPoseMinSpan: 0.9, // T-poz için minimum kol açıklığı (S)
    flapUpLevel: -0.3, // Kol kaldırma tekrarında "yukarıda" sayılma seviyesi
    flapDownLevel: 0.5, // Kol indirme tekrarında "aşağıda" sayılma seviyesi
    squatMinDrop: 0.2, // Squat adımında kabul edilen minimum kalça düşüşü (S)
    squatMaxKneeDeg: 145, // ...ya da diz açısı bunun altına inmeli
    jumpMinRise: 0.05, // Zıplama adımında kabul edilen minimum yükseliş (S)

    // Ölçümden eşik türetme (oyuncu lehine: eşikler ölçülen hareketin altında tutulur)
    flapLevelFrac: 0.4, // Kurma/tamamlama seviyeleri genliğin bu oranı kadar içeride
    flapRefAmpFrac: 0.7, // strength=1 için gereken genlik = ölçülen genliğin bu oranı
    flapMinSpeedFrac: 0.35, // Minimum iniş hızı = ölçülen tepe hızın bu oranı
    flapRefSpeedFrac: 0.9, // strength=1 hızı = ölçülen tepe hızın bu oranı
    tPoseSpanFrac: 0.75, // Glide için kol açıklığı eşiği = ölçülen açıklığın bu oranı
    squatFullFrac: 0.85, // Rahat squat'ın bu oranında squatDepth=1 olur
    squatKneeMargin: 5, // Ölçülen en küçük diz açısına eklenen pay (derece)
    jumpRiseFrac: 0.45, // Zıplama eşiği = ölçülen yükselişin bu oranı
    jumpSpeedFrac: 0.4, // Kalça hız eşiği = ölçülen tepe hızın bu oranı
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
