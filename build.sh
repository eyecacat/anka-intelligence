#!/bin/bash
set -e

# Ortam değişkenlerini zorla
export LB_MODE=debian
export LB_DISTRIBUTION=bookworm

echo "[ANKA] Build ortamı temizleniyor..."
rm -rf build
mkdir -p build
cd build

echo "[ANKA] live-build yapılandırılıyor..."
lb config --mode debian           --distribution bookworm           --parent-distribution bookworm           --architectures amd64           --archive-areas "main contrib non-free non-free-firmware"           --mirror-bootstrap http://deb.debian.org/debian/           --mirror-chroot http://deb.debian.org/debian/           --mirror-binary http://deb.debian.org/debian/           --binary-images iso-hybrid           --bootappend-live "boot=live components quiet splash locales=tr_TR.UTF-8 keyboard-layouts=tr"           --iso-volume "AnkaIntelligence"           --iso-publisher "Anka Labs"           --memtest none           --debian-installer none

echo "[ANKA] Proje dosyaları kopyalanıyor..."
cp -r ../config/live/* config/

echo "[ANKA] ISO build başlıyor..."
lb build 2>&1 | tee build.log
