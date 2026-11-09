import { readDevice, applyDevice } from './studio-device.js';
import { runDeviceAction } from './studio-maintenance.js';
import { readOutputs, applyOutputs } from './studio-outputs.js';
import { readScreens, applyScreens } from './studio-screens.js';
import { readProgramming, applyProgramming } from './studio-programming.js';

export const studioRoutes = {
  '/api/device': { read: readDevice, write: (client, body) => applyDevice(client, body.changes) },
  '/api/device-action': { read: readDevice, write: (client, body) => runDeviceAction(client, body, readDevice) },
  '/api/outputs': { read: readOutputs, write: (client, body) => applyOutputs(client, body.changes) },
  '/api/screens': { read: readScreens, write: applyScreens },
  '/api/programming': { read: readProgramming, write: applyProgramming },
};
