// Reanimated and Worklets need native code, so tests use a lightweight stand-in.
jest.mock('react-native-reanimated', () => require('@/testing/reanimatedMock').reanimatedMock);
jest.mock('react-native-worklets', () => ({}));
