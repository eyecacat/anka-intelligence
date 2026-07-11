#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Anka Intelligence OS — Live ISO Build Script
# Gereksinim: Debian/Ubuntu host, sudo, live-build paketi
# Kullanım:   sudo ./build.sh
#             sudo ./build.sh --clean   (önce temizle)
# ═══════════════════════════════════════════════════════════
set -euo pipefail

# ── Renkler ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; AMBER='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[ANKA]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${AMBER}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }

# ── Root kontrolü ─────────────────────────────────────────────────────────────
[[ "$EUID" -ne 0 ]] && error "Bu script root olarak çalıştırılmalıdır: sudo ./build.sh"

# ── Bağımlılık kontrolü ───────────────────────────────────────────────────────
for cmd in lb wget curl python3; do
  command -v "$cmd" &>/dev/null || error "'$cmd' bulunamadı. Kurun: apt install live-build wget curl python3"
done

# ── Değişkenler ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build-cache"
OUTPUT_DIR="$SCRIPT_DIR/output"
ISO_NAME="anka-intelligence-os-$(date +%Y%m%d).iso"
ARCH="amd64"
DEBIAN_VERSION="bookworm"   # Debian 12

# ── Temizlik ──────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--clean" ]]; then
  info "Önceki build temizleniyor..."
  rm -rf "$BUILD_DIR"
  success "Temizlendi."
fi

mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"
cd "$BUILD_DIR"

# ── live-build konfigürasyonu ─────────────────────────────────────────────────
info "live-build yapılandırılıyor..."
lb config \
  --architectures "$ARCH" \
  --distribution "$DEBIAN_VERSION" \
  --binary-images iso-hybrid \
  --bootappend-live "boot=live components quiet splash locales=tr_TR.UTF-8 keyboard-layouts=tr" \
  --apt-options "--yes --no-install-recommends" \
  --mirror-bootstrap "http://deb.debian.org/debian/" \
  --mirror-binary    "http://deb.debian.org/debian/" \
  --archive-areas    "main contrib non-free non-free-firmware" \
  --memtest none \
  --iso-application  "Anka Intelligence OS" \
  --iso-publisher    "Anka Labs" \
  --iso-volume       "AnkaOS-$(date +%Y%m%d)"

# ── Proje dosyalarını build dizinine kopyala ──────────────────────────────────
info "Proje dosyaları kopyalanıyor..."

rsync -a --delete \
  "$SCRIPT_DIR/config/" \
  "$BUILD_DIR/config/"

# Hook'ların çalıştırılabilir olduğundan emin ol
chmod +x "$BUILD_DIR/config/live/hooks/live/"*.hook.chroot 2>/dev/null || true

# ── Build ─────────────────────────────────────────────────────────────────────
info "ISO build başlıyor... (bu 10-30 dakika sürebilir)"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

lb build 2>&1 | tee "$OUTPUT_DIR/build.log"

# ── ISO çıktısını taşı ────────────────────────────────────────────────────────
BUILT_ISO=$(find "$BUILD_DIR" -maxdepth 1 -name "*.iso" | head -1)
if [[ -z "$BUILT_ISO" ]]; then
  error "ISO dosyası bulunamadı. Build log: $OUTPUT_DIR/build.log"
fi

mv "$BUILT_ISO" "$OUTPUT_DIR/$ISO_NAME"

ISO_SIZE=$(du -sh "$OUTPUT_DIR/$ISO_NAME" | cut -f1)

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
success "Build tamamlandı!"
info "ISO  : ${BOLD}$OUTPUT_DIR/$ISO_NAME${NC}"
info "Boyut: $ISO_SIZE"
info "Log  : $OUTPUT_DIR/build.log"
echo ""
info "USB'ye yazmak için:"
echo -e "  ${AMBER}sudo dd if=$OUTPUT_DIR/$ISO_NAME of=/dev/sdX bs=4M status=progress${NC}"
echo ""
