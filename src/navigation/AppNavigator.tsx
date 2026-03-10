import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Platform,
    Modal, Pressable, Animated as RNAnimated, Easing,
} from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, useNavigation, createNavigationContainerRef } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Dashboard from '../screens/Dashboard';
import Schedule from '../screens/Schedule';
import Records from '../screens/Records';
import Profile from '../screens/Profile';
import PrescriptionDetailScreen from '../screens/PrescriptionDetailScreen';
import { colors } from '../theme/colors';
import { GlobalToast } from '../context/ToastContext';
import { useNotificationResponse } from '../hooks/useNotificationResponse';
import { NotificationService } from '../services/notificationService';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Tab Item Component ──────────────────────────────────────────
const TabItem = ({ label, iconFocused, iconOutline, isFocused, onPress }: {
    label: string;
    iconFocused: string;
    iconOutline: string;
    isFocused: boolean;
    onPress: () => void;
}) => {
    const scale = useSharedValue(1);

    React.useEffect(() => {
        scale.value = withSpring(isFocused ? 1.1 : 1, { damping: 12, stiffness: 200 });
    }, [isFocused]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <TouchableOpacity
            onPress={() => {
                if (!isFocused) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress();
            }}
            activeOpacity={0.7}
            style={tabStyles.tabItem}
        >
            <Animated.View style={[tabStyles.tabItemInner, animatedStyle]}>
                <MaterialCommunityIcons
                    name={(isFocused ? iconFocused : iconOutline) as any}
                    size={24}
                    color={isFocused ? colors.primary : '#9ca3af'}
                />
                <Text style={[
                    tabStyles.tabLabel,
                    { color: isFocused ? colors.primary : '#9ca3af', fontWeight: isFocused ? '600' : '400' }
                ]}>
                    {label}
                </Text>
            </Animated.View>
        </TouchableOpacity>
    );
};

// ─── FAB Speed Dial Menu Item ────────────────────────────────────
const SpeedDialItem = ({ emoji, label, subtitle, onPress, delay }: {
    emoji: string; label: string; subtitle: string;
    onPress: () => void; delay: number;
}) => {
    const [anim] = React.useState(new RNAnimated.Value(0));

    React.useEffect(() => {
        RNAnimated.timing(anim, {
            toValue: 1,
            duration: 250,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, []);

    const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });

    return (
        <RNAnimated.View style={{ opacity: anim, transform: [{ translateY }] }}>
            <TouchableOpacity style={dialStyles.item} onPress={onPress} activeOpacity={0.8}>
                <View style={dialStyles.iconCircle}>
                    <MaterialCommunityIcons name={emoji as any} size={24} color="#2563eb" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={dialStyles.itemLabel}>{label}</Text>
                    <Text style={dialStyles.itemSubtitle}>{subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
        </RNAnimated.View>
    );
};

// ─── Custom Tab Bar ──────────────────────────────────────────────
const CustomTabBar = ({ state, descriptors, navigation: tabNavigation }: BottomTabBarProps) => {
    const insets = useSafeAreaInsets();
    const stackNavigation = useNavigation<any>();
    const [showSpeedDial, setShowSpeedDial] = useState(false);
    const fabRotateAnim = useRef(new RNAnimated.Value(0)).current;

    const tabConfig = [
        { name: 'Dashboard', label: 'Trang chủ', iconFocused: 'home-heart', iconOutline: 'home-outline' },
        { name: 'Schedule', label: 'Lịch uống', iconFocused: 'clock-check', iconOutline: 'clock-outline' },
        { name: 'Records', label: 'Đơn thuốc', iconFocused: 'clipboard-text', iconOutline: 'clipboard-text-outline' },
        { name: 'Profile', label: 'Cá nhân', iconFocused: 'account-circle', iconOutline: 'account-circle-outline' },
    ];

    const handleFABPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const opening = !showSpeedDial;
        setShowSpeedDial(opening);
        RNAnimated.timing(fabRotateAnim, {
            toValue: opening ? 1 : 0,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    const closeDial = () => {
        setShowSpeedDial(false);
        RNAnimated.timing(fabRotateAnim, {
            toValue: 0,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    const handleSelectPrescription = () => {
        closeDial();
        stackNavigation.navigate('ManualAdd');
    };

    const handleSelectRoutine = () => {
        closeDial();
        stackNavigation.navigate('RoutineAdd');
    };

    return (
        <>
            {/* Speed Dial Modal */}
            <Modal
                visible={showSpeedDial}
                transparent
                animationType="fade"
                onRequestClose={closeDial}
            >
                <Pressable
                    style={dialStyles.backdrop}
                    onPress={closeDial}
                >
                    <View style={[
                        dialStyles.menu,
                        { bottom: 90 + (insets.bottom > 0 ? insets.bottom : 8) },
                    ]}>
                        <Text style={dialStyles.menuTitle}>Tạo mới</Text>
                        <SpeedDialItem
                            emoji="clipboard-plus"
                            label="Thêm Đơn thuốc"
                            subtitle="Theo chỉ định của bác sĩ"
                            onPress={handleSelectPrescription}
                            delay={0}
                        />
                        <SpeedDialItem
                            emoji="leaf-circle"
                            label="Thêm Thuốc định kỳ"
                            subtitle="Vitamin, thực phẩm chức năng"
                            onPress={handleSelectRoutine}
                            delay={80}
                        />
                    </View>
                </Pressable>
            </Modal>

            {/* Tab Bar */}
            <View style={[tabStyles.outerWrapper, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
                <View style={tabStyles.barContainer}>
                    {/* Left tabs */}
                    {tabConfig.slice(0, 2).map((tab, index) => {
                        const isFocused = state.index === index;
                        return (
                            <TabItem
                                key={tab.name}
                                label={tab.label}
                                iconFocused={tab.iconFocused}
                                iconOutline={tab.iconOutline}
                                isFocused={isFocused}
                                onPress={() => {
                                    const event = tabNavigation.emit({
                                        type: 'tabPress',
                                        target: state.routes[index].key,
                                        canPreventDefault: true,
                                    });
                                    if (!isFocused && !event.defaultPrevented) {
                                        tabNavigation.navigate(state.routes[index].name);
                                    }
                                }}
                            />
                        );
                    })}

                    {/* Center FAB */}
                    <View style={tabStyles.fabWrapper}>
                        <TouchableOpacity
                            style={tabStyles.fabButton}
                            onPress={handleFABPress}
                            activeOpacity={1}
                        >
                            <RNAnimated.View style={{
                                transform: [{
                                    rotate: fabRotateAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['0deg', '45deg'],
                                    }),
                                }],
                            }}>
                                <Ionicons name="add" size={32} color="#ffffff" />
                            </RNAnimated.View>
                        </TouchableOpacity>
                    </View>

                    {/* Right tabs */}
                    {tabConfig.slice(2, 4).map((tab, index) => {
                        const realIndex = index + 2;
                        const isFocused = state.index === realIndex;
                        return (
                            <TabItem
                                key={tab.name}
                                label={tab.label}
                                iconFocused={tab.iconFocused}
                                iconOutline={tab.iconOutline}
                                isFocused={isFocused}
                                onPress={() => {
                                    const event = tabNavigation.emit({
                                        type: 'tabPress',
                                        target: state.routes[realIndex].key,
                                        canPreventDefault: true,
                                    });
                                    if (!isFocused && !event.defaultPrevented) {
                                        tabNavigation.navigate(state.routes[realIndex].name);
                                    }
                                }}
                            />
                        );
                    })}
                </View>
            </View>
        </>
    );
};

// ─── Tab Styles ──────────────────────────────────────────────────
const tabStyles = StyleSheet.create({
    outerWrapper: {
        backgroundColor: 'transparent',
        paddingHorizontal: 12,
        paddingTop: 0,
    },
    barContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        backgroundColor: '#ffffff',
        borderRadius: 28,
        paddingVertical: 10,
        paddingHorizontal: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 8,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabItemInner: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabLabel: {
        fontSize: 11,
        marginTop: 3,
    },
    fabWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
        width: 64,
        height: 64,
    },
    fabButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#f97316',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#f97316',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
});

// ─── Speed Dial Styles ───────────────────────────────────────────
const dialStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    menu: {
        position: 'absolute',
        left: 16,
        right: 16,
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 12,
    },
    menuTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1f2937',
        marginBottom: 20,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        gap: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    iconCircle: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1f2937',
    },
    itemSubtitle: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 2,
    },
});

// ─── Tab Navigator ───────────────────────────────────────────────
function TabNavigator() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.white },
                headerTitleStyle: { color: colors.primary, fontWeight: 'bold' },
                tabBarHideOnKeyboard: true,
            }}
        >
            <Tab.Screen name="Dashboard" component={Dashboard} options={{ title: 'Trang chủ', headerShown: false }} />
            <Tab.Screen name="Schedule" component={Schedule} options={{ title: 'Lịch uống', headerShown: false }} />
            <Tab.Screen name="Records" component={Records} options={{ title: 'Đơn thuốc', headerShown: false }} />
            <Tab.Screen name="Profile" component={Profile} options={{ title: 'Cá nhân', headerShown: false }} />
        </Tab.Navigator>
    );
}

export const navigationRef = createNavigationContainerRef<any>();

export default function AppNavigator() {
    const [routeName, setRouteName] = useState<string>('Dashboard');
    const insets = useSafeAreaInsets();

    // Register notification response listener
    useNotificationResponse();

    const bottomTabs = ['Dashboard', 'Schedule', 'Records', 'Profile'];
    const isTabScreen = bottomTabs.includes(routeName);

    // Dynamic offset: 
    // - Tabs: insets.bottom + bar container (~72) + 18px padding = ~90 + insets.bottom
    // - Modals/Full screen: insets.bottom + 18px
    const bottomOffset = isTabScreen
        ? (insets.bottom > 0 ? insets.bottom : 8) + 90 // Above custom tab bar
        : (insets.bottom > 0 ? insets.bottom : 24) + 18; // Above safe area

    return (
        <NavigationContainer
            ref={navigationRef}
            onReady={() => {
                setRouteName(navigationRef.getCurrentRoute()?.name || 'Dashboard');
            }}
            onStateChange={() => {
                const current = navigationRef.getCurrentRoute()?.name;
                if (current) setRouteName(current);
            }}
        >
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Stack.Screen
                    name="MainTabs"
                    component={TabNavigator}
                    options={{ title: '' }}
                />
                <Stack.Screen
                    name="ManualAdd"
                    component={require('../screens/ManualAddScreen').default}
                    options={{ headerShown: false, presentation: 'modal' }}
                />
                <Stack.Screen
                    name="RoutineAdd"
                    component={require('../screens/RoutineAddScreen').default}
                    options={{ headerShown: false, presentation: 'modal' }}
                />
                <Stack.Screen
                    name="ManualAddReview"
                    component={require('../screens/ManualAddReviewScreen').default}
                    options={{ headerShown: false, presentation: 'fullScreenModal' }}
                />
                <Stack.Screen
                    name="ComingSoon"
                    component={require('../screens/ComingSoonScreen').default}
                    options={{ headerShown: false, presentation: 'card' }}
                />
                <Stack.Screen
                    name="PrescriptionDetail"
                    component={PrescriptionDetailScreen}
                    options={{ headerShown: false }}
                />
            </Stack.Navigator>

            <GlobalToast bottomOffset={bottomOffset} />
        </NavigationContainer>
    );
}
