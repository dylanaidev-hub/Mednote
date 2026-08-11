#!/bin/zsh
# ─── MedNote: Generate Android Mipmap Icons from source PNG ───────
# Uses macOS built-in `sips` tool (no extra dependencies needed)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES_DIR="$PROJECT_ROOT/android/app/src/main/res"
ASSETS_DIR="$PROJECT_ROOT/assets"

ICON_SOURCE="$ASSETS_DIR/icon.png"
FOREGROUND_SOURCE="$ASSETS_DIR/android-icon-foreground.png"

echo "📱 MedNote Icon Generator"
echo "========================="

# Check source files
if [ ! -f "$ICON_SOURCE" ]; then
    echo "❌ Error: $ICON_SOURCE not found!"
    exit 1
fi

if [ ! -f "$FOREGROUND_SOURCE" ]; then
    echo "⚠️  android-icon-foreground.png not found, using icon.png"
    FOREGROUND_SOURCE="$ICON_SOURCE"
fi

# Function to resize with sips
resize() {
    local src="$1" dst="$2" size="$3"
    cp "$src" "$dst"
    sips -z "$size" "$size" "$dst" > /dev/null 2>&1
}

echo ""
echo "🔧 Generating launcher icons..."

# ── ic_launcher (standard) ──
# mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192
for pair in "mdpi:48" "hdpi:72" "xhdpi:96" "xxhdpi:144" "xxxhdpi:192"; do
    density="${pair%%:*}"
    size="${pair##*:}"
    dir="$RES_DIR/mipmap-$density"
    mkdir -p "$dir"

    # Remove old webp files
    rm -f "$dir/ic_launcher.webp" "$dir/ic_launcher_round.webp"

    resize "$ICON_SOURCE" "$dir/ic_launcher.png" "$size"
    cp "$dir/ic_launcher.png" "$dir/ic_launcher_round.png"

    echo "   ✅ mipmap-$density: ${size}x${size}px"
done

echo ""
echo "🔧 Generating adaptive icon foreground..."

# ── ic_launcher_foreground (adaptive safe zone) ──
# mdpi=108, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432
for pair in "mdpi:108" "hdpi:162" "xhdpi:216" "xxhdpi:324" "xxxhdpi:432"; do
    density="${pair%%:*}"
    size="${pair##*:}"
    dir="$RES_DIR/mipmap-$density"

    # Remove old webp
    rm -f "$dir/ic_launcher_foreground.webp"

    resize "$FOREGROUND_SOURCE" "$dir/ic_launcher_foreground.png" "$size"

    echo "   ✅ mipmap-$density: ${size}x${size}px"
done

echo ""
echo "🔧 Updating adaptive icon XML..."

cat > "$RES_DIR/mipmap-anydpi-v26/ic_launcher.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackground"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
XML

cat > "$RES_DIR/mipmap-anydpi-v26/ic_launcher_round.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackground"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
XML

echo ""
echo "════════════════════════════════════════════"
echo "✅ All icons generated successfully!"
echo ""
echo "🔨 Next: Build APK with Android Studio or:"
echo "   cd android && ./gradlew assembleRelease"
echo "════════════════════════════════════════════"
