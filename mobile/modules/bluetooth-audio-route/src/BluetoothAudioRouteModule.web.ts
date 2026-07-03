import { registerWebModule, NativeModule } from 'expo';

class BluetoothAudioRouteModule extends NativeModule<{}> {}

export default registerWebModule(BluetoothAudioRouteModule, 'BluetoothAudioRouteModule');
