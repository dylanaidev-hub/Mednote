---
description: Mở Android Emulator và chạy app MedNote ở chế độ dev (hot reload)
---

## Chạy app MedNote trên Android Emulator

// turbo-all

### Bước 1: Khởi động Emulator
```bash
$HOME/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 &
```

### Bước 2: Đợi emulator boot xong
```bash
$HOME/Library/Android/sdk/platform-tools/adb wait-for-device && sleep 5 && echo "READY"
```

### Bước 3: Build + cài debug app + khởi động Metro bundler
```bash
cd "/Users/tungnguyen/Documents/Vibe Coding/MedNote" && npx expo run:android
```

Sau bước 3, app sẽ tự mở trên emulator với **hot reload** — sửa code tự cập nhật.

### Lưu ý
- Lần đầu build mất ~3-5 phút, các lần sau nhanh hơn (~30s)
- Nếu Metro bundler bị tắt, chạy riêng: `npx expo start --dev-client`
- Nếu chỉ muốn cài APK release (không hot reload): `adb install android/app/build/outputs/apk/release/app-release.apk`
