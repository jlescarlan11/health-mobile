type PlatformSelect = { ios?: any; android?: any; default?: any };

export const Platform = {
  OS: 'ios',
  select: (options: PlatformSelect) => options.ios ?? options.default ?? options.android,
};

export const Alert = {
  alert: () => {},
};

export const Linking = {
  openURL: async () => true,
  canOpenURL: async () => true,
};

export const Share = {
  share: async () => ({ action: 'sharedAction' }),
};

export const Dimensions = {
  get: () => ({ width: 390, height: 844 }),
};

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
  removeEventListener: () => {},
};

export const Keyboard = {
  addListener: () => ({ remove: () => {} }),
  removeAllListeners: () => {},
};

export const StyleSheet = {
  create: <T>(styles: T) => styles,
};

const noopComponent = (..._args: any[]) => null;

export const View = noopComponent;
export const Text = noopComponent;
export const Image = noopComponent;
export const TouchableOpacity = noopComponent;
export const ActivityIndicator = noopComponent;

export const NativeModules = {};

export default {
  Platform,
  Alert,
  Linking,
  Share,
  Dimensions,
  AppState,
  Keyboard,
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  NativeModules,
};
