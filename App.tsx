import "./global.css";
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MedProvider, useMedContext } from './src/context/MedContext';
import { ToastProvider } from './src/context/ToastContext';
import { UserProvider } from './src/context/UserContext';
import AppNavigator from './src/navigation/AppNavigator';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AnimatedSplash from './src/components/AnimatedSplash';

function AppContent() {
  const { isLoading } = useMedContext();

  return (
    <AnimatedSplash isReady={!isLoading}>
      <ToastProvider>
        <UserProvider>
          <AppNavigator />
        </UserProvider>
      </ToastProvider>
    </AnimatedSplash>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <SafeAreaProvider>
        <MedProvider>
          <AppContent />
        </MedProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
