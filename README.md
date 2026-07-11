# 🦅 Anka Intelligence OS

> Debian 12 Live tabanlı, 10 AI ajanı barındıran, Chromium Kiosk modunda çalışan yerel yapay zeka işletim sistemi.

---

## Mimari

```
┌─────────────────────────────────────────────┐
│               Chromium Kiosk                │
│  ┌─────────────────────────────────────┐    │
│  │  Lisans Aktivasyon Modal            │    │
│  │  → sessionStorage'a key kaydet      │    │
│  │  → Chat UI açılır                   │    │
│  └──────────────┬──────────────────────┘    │
│                 │ HTTP (X-Anka-License-Key)  │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│          Yön Core (Flask :5050)             │
│  /api/health   → servis durumu              │
│  /api/agents   → ajan listesi               │
│  /api/chat     → OpenRouter proxy           │
│  /shell/*      → statik UI dosyaları        │
└─────────────────┬───────────────────────────┘
                  │ Bearer <license_key>
┌─────────────────▼───────────────────────────┐
│            OpenRouter API                   │
│  GPT-4o / Claude / Haiku / ...             │
└─────────────────────────────────────────────┘
```

## Servis Zinciri (Boot Sırası)

```
nodm (otomatik login: anka)
  └── Xorg
       └── yon-core.service      (Flask backend)
            └── anka-kiosk.service   (Chromium)
                 └── anka-watchdog.service (sağlık izleme)
```

---

## Dizin Yapısı

```
anka-intelligence/
├── build.sh                          # ISO build scripti
├── .github/workflows/build.yml       # CI/CD otomatik build
├── output/                           # Build çıktıları (gitignore'd)
└── config/
    └── live/
        ├── package-lists/
        │   └── anka.list.chroot      # Debian paket listesi
        ├── hooks/live/
        │   ├── 0010-setup.hook.chroot      # marked.js indir, dizinler
        │   └── 0020-enable-services.hook.chroot  # systemd enable
        └── includes.chroot/
            ├── etc/
            │   ├── anka/config.json         # Sunucu konfigürasyonu
            │   └── systemd/system/
            │       ├── yon-core.service
            │       ├── anka-kiosk.service
            │       └── anka-watchdog.service
            └── opt/anka/
                ├── yon/yon_core.py          # Flask backend
                └── shell/
                    ├── index.html
                    ├── style.css
                    ├── app.js
                    └── marked.min.js        # Hook ile indirilir
```

---

## Güvenlik Mimarisi

| Kural | Detay |
|-------|-------|
| API key config'de yok | `config.json` içinde hiçbir secret tutulmaz |
| Key header'dan alınır | `X-Anka-License-Key` veya `Authorization: Bearer` |
| sessionStorage | Key sekme kapanınca silinir, localStorage kullanılmaz |
| Systemd hardening | `NoNewPrivileges`, `ProtectSystem`, `PrivateTmp` |
| Kiosk modu | F11 çıkışı, adres çubuğu, sekme — hepsi kapalı |

---

## Build

### Gereksinimler
- Debian 12 veya Ubuntu 22.04 host
- `live-build`, `wget`, `curl`, `rsync` paketleri
- En az 20GB boş disk, 4GB RAM

### ISO Oluştur

```bash
# İlk build
sudo ./build.sh

# Temiz build (cache sıfırla)
sudo ./build.sh --clean
```

Çıktı: `output/anka-intelligence-os-YYYYMMDD.iso`

### USB'ye Yaz

```bash
sudo dd if=output/anka-intelligence-os-*.iso of=/dev/sdX bs=4M status=progress
```

### VirtualBox Test

1. Yeni VM oluştur → Linux / Debian 64-bit
2. RAM: 2048 MB, Video: 128 MB
3. ISO'yu optical drive'a ekle
4. Boot et

---

## AI Ajanlar

| ID | Ad | Model |
|----|----|-------|
| `genel` | Genel Asistan | gpt-4o-mini |
| `kod` | Kod Uzmanı | claude-3-haiku |
| `analiz` | Veri Analisti | gpt-4o |
| `hukuk` | Hukuk Asistanı | claude-3-haiku |
| `finans` | Finans Asistanı | gpt-4o-mini |
| `saglik` | Sağlık Rehberi | gpt-4o-mini |
| `egitim` | Eğitim Koçu | claude-3-haiku |
| `ik` | İK Asistanı | gpt-4o-mini |
| `pazarlama` | Pazarlama Uzmanı | gpt-4o-mini |
| `teknik` | Teknik Destek | gpt-4o |

---

## Lisans Aktivasyonu

Sistem açıldığında Chromium, lisans anahtarı giriş ekranını gösterir.

1. [OpenRouter](https://openrouter.ai) hesabı oluştur
2. API key al (`sk-or-...`)
3. Anka aktivasyon ekranına gir
4. Key yalnızca o oturum için bellekte tutulur

---

## Servis Yönetimi (Canlı Sistemde)

```bash
# Durum kontrol
systemctl status yon-core
systemctl status anka-kiosk
systemctl status anka-watchdog

# Log takip
journalctl -u yon-core -f
journalctl -u anka-kiosk -f

# Backend test
curl http://127.0.0.1:5050/api/health
```

---

## Roadmap

- [ ] Faz 6 — Lisans sunucusu entegrasyonu (merkezi key doğrulama)
- [ ] Faz 7 — Offline model desteği (Ollama entegrasyonu)
- [ ] Faz 8 — Çoklu dil desteği
- [ ] Faz 9 — Admin paneli (kullanım istatistikleri)
- [ ] Faz 10 — OTA güncelleme mekanizması
