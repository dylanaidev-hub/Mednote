import { registerRootComponent } from 'expo';

import App from './App';

// ─── Import background notification refill task at ROOT LEVEL ───
// TaskManager.defineTask() runs at module evaluation time.
import './src/tasks/backgroundNotificationTask';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
