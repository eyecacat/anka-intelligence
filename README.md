# Anka Intelligence OS

Anka Intelligence OS, Debian 12 Bookworm Live tabanli, kurulum gerektirmeyen ve tarayici uzerinden calisan bir AI isletim sistemi prototipidir. Sistem acildiginda Chromium kiosk modunda Anka Shell arayuzunu baslatir ve yerel YON servisi uzerinden OpenRouter API ile konusur.

## Ozellikler

- Debian 12 Live ISO
- Masaustu ortami olmadan Chromium kiosk shell
- Python 3 ile yazilmis yerel HTTP API
- OpenRouter `openai/gpt-4o` modeli
- 10 ayri AI ajan ve ajan bazli sohbet gecmisi
- Round-robin API anahtari rotasyonu
- GitHub Actions ile otomatik ISO build

## Ajanlar

- CEO
- CTO
- Yazilimci
- Siber Guvenlikci
- UI/UX Tasarimcisi
- Mali Musavir
- Hukuk Danismani
- QA Muhendisi
- Urun & Reklam
- Satis & Musteri Iliskileri

## API Anahtarlari

ISO olusturmadan once `config/live/includes.chroot/etc/anka/config.json` dosyasindaki `OPENROUTER_API_KEY_01` ... `OPENROUTER_API_KEY_10` degerlerini kendi OpenRouter API anahtarlarinizla degistirin.

Gecersiz placeholder anahtarlar calisma aninda yok sayilir. En az bir gecerli API anahtari gereklidir.

## Yerel ISO Build

Debian veya Ubuntu tabanli bir sistemde:

```bash
sudo apt-get update
sudo apt-get install -y live-build debootstrap squashfs-tools xorriso isolinux syslinux-common
mkdir -p build
cd build
lb config \
  --distribution bookworm \
  --architectures amd64 \
  --binary-images iso-hybrid \
  --bootappend-live "boot=live components quiet splash" \
  --iso-volume "AnkaIntelligence" \
  --iso-publisher "Anka Intelligence OS" \
  --memtest none \
  --debian-installer none
cp -r ../config/live/* config/
sudo lb build
```

## GitHub Actions

`main` branch'e push yapildiginda `.github/workflows/build-iso.yml` workflow'u ISO olusturur ve `anka-intelligence-iso` artifact'i olarak yukler.

Etiketli release icin:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Proje Yapisi

```text
anka-intelligence/
├── .github/workflows/build-iso.yml
├── config/live/package-lists/anka.list.chroot
├── config/live/hooks/live/0010-setup.hook.chroot
├── config/live/hooks/normal/9999-cleanup.hook.binary
├── config/live/includes.chroot/etc/anka/config.json
├── config/live/includes.chroot/etc/systemd/system/anka-yon.service
├── config/live/includes.chroot/etc/systemd/system/anka-shell.service
├── config/live/includes.chroot/opt/anka/yon/agents.json
├── config/live/includes.chroot/opt/anka/yon/yon_core.py
├── config/live/includes.chroot/opt/anka/shell/index.html
├── config/live/includes.chroot/opt/anka/shell/app.js
├── config/live/includes.chroot/opt/anka/shell/style.css
├── config/live/includes.chroot/usr/local/bin/anka-start
└── scripts/post-build.sh
```

## Notlar

Bu repo bir prototip iskeletidir. Uretim kullanimindan once API anahtar yonetimi, ag guvenligi, sistem servis yetkileri ve ISO imzalama sureclerinin ayrica sertlestirilmesi onerilir.
