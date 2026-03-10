import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

export default function Scanner() {
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const [flashOn, setFlashOn] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const navigation = useNavigation<any>();
    const scanLinePosition = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isScanning) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(scanLinePosition, {
                        toValue: 380, // Chiều cao xấp xỉ của khung focus container
                        duration: 1500,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    }),
                    Animated.timing(scanLinePosition, {
                        toValue: 0,
                        duration: 1500,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    })
                ])
            ).start();

            // Tạm thời mô phỏng xử lý 3 giây sau đó chuyển trang
            setTimeout(() => {
                setIsScanning(false);
                Alert.alert("Thành công", "Đã nhận diện đơn thuốc", [
                    { text: "Xem chi tiết", onPress: () => navigation.navigate('MedicineDetail', { id: '1' }) }
                ]);
            }, 3000);
        } else {
            scanLinePosition.setValue(0);
        }
    }, [isScanning, scanLinePosition]);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 1,
        });

        if (!result.canceled) {
            setIsScanning(true);
        }
    };

    if (!permission) {
        return <View className="flex-1 bg-black" />;
    }

    if (!permission.granted) {
        return (
            <View className="flex-1 items-center justify-center bg-background p-6">
                <Ionicons name="camera-outline" size={64} color="#2563eb" className="mb-4" />
                <Text className="text-center mb-6 text-text text-lg">Chúng tôi cần quyền truy cập camera để quét đơn thuốc của bạn dễ dàng hơn.</Text>
                <TouchableOpacity className="bg-primary px-8 py-3 rounded-xl shadow-sm" onPress={requestPermission}>
                    <Text className="text-white font-bold text-lg">Cấp quyền Camera</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-black">
            <CameraView
                style={styles.camera}
                facing={facing}
                enableTorch={flashOn}
            >
                <View style={styles.overlay}>
                    <View style={styles.unfocusedContainer}>
                        {/* Header Actions */}
                        <View className="flex-row justify-between w-full px-6 pt-16">
                            <TouchableOpacity
                                className="w-12 h-12 rounded-full bg-black/40 items-center justify-center"
                                onPress={() => navigation.goBack()}
                            >
                                <Ionicons name="close" size={28} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`w-12 h-12 rounded-full items-center justify-center ${flashOn ? 'bg-[#f59e0b]' : 'bg-black/40'}`}
                                onPress={() => setFlashOn(!flashOn)}
                            >
                                <Ionicons name={flashOn ? "flash" : "flash-off"} size={24} color="white" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.middleContainer}>
                        <View style={styles.unfocusedSideContainer}></View>
                        <View style={styles.focusedContainer}>
                            <View className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white border-primary rounded-tl-xl" />
                            <View className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white border-primary rounded-tr-xl" />
                            <View className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white border-primary rounded-bl-xl" />
                            <View className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white border-primary rounded-br-xl" />

                            {isScanning && (
                                <Animated.View
                                    style={[
                                        styles.scanningLine,
                                        { transform: [{ translateY: scanLinePosition }] }
                                    ]}
                                />
                            )}
                        </View>
                        <View style={styles.unfocusedSideContainer}></View>
                    </View>

                    <View style={[styles.unfocusedContainer, { paddingBottom: 40 }]}>
                        <Text className="text-white text-center mt-6 text-base px-10 leading-6 shadow-sm">
                            Hãy giữ camera thẳng và để trong môi trường đủ ánh sáng để đọc chữ rõ hơn
                        </Text>

                        <View className="flex-row items-center justify-center mt-12 w-full px-12 relative">
                            <TouchableOpacity
                                className="absolute left-8 w-14 h-14 rounded-full bg-black/40 items-center justify-center"
                                onPress={pickImage}
                            >
                                <Ionicons name="image-outline" size={28} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                className="bg-white w-20 h-20 rounded-full items-center justify-center p-1"
                                onPress={() => setIsScanning(true)}
                                disabled={isScanning}
                            >
                                <View className={`w-full h-full rounded-full transition-colors ${isScanning ? 'bg-primary/50' : 'bg-primary'}`}>
                                    {isScanning && <Ionicons name="scan-outline" size={32} color="white" className="absolute top-[21px] left-[21px]" />}
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    camera: { flex: 1 },
    overlay: { flex: 1 },
    unfocusedContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center' },
    unfocusedSideContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    middleContainer: { flexDirection: 'row', height: 400 },
    focusedContainer: {
        flex: 5,
        backgroundColor: 'transparent',
    },
    scanningLine: {
        width: '100%',
        height: 3,
        backgroundColor: '#10b981', // success color (green)
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 5,
        position: 'absolute',
        top: 0
    }
});
