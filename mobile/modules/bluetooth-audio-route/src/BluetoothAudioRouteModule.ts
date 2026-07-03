import { requireNativeModule } from 'expo-modules-core';

export type BluetoothRouteResult = {
  success: boolean;
  deviceName: string | null;
  deviceType: number | null;
  message: string;
};

export type BluetoothRouteStatus = {
  active: boolean;
  deviceName: string | null;
  deviceType: number | null;
};

type BluetoothAudioRouteModule = {
  startBluetoothRoute(): Promise<BluetoothRouteResult>;
  stopBluetoothRoute(): Promise<boolean>;
  getBluetoothRouteStatus(): Promise<BluetoothRouteStatus>;
};

export default requireNativeModule<BluetoothAudioRouteModule>(
  'BluetoothAudioRoute'
);
