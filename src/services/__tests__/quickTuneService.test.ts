/**
 * QuickTune Service Unit Tests
 *
 * QuickTune is an NRP_ROS/ArduRover legacy contract. 4WD_SERVER does not expose
 * /api/quicktune/*, CIRCLE mode tuning, or Lua aux-function tuning controls.
 */

import { quickTuneService } from '../quickTuneService';

const DISABLED_MESSAGE = /NRP_ROS QuickTune disabled/;

describe('QuickTuneService', () => {
  it('rejects script checks without calling legacy /api/quicktune routes', async () => {
    await expect(quickTuneService.checkScript()).rejects.toThrow(DISABLED_MESSAGE);
  });

  it('rejects script uploads without calling legacy /api/quicktune routes', async () => {
    await expect(quickTuneService.uploadScript()).rejects.toThrow(DISABLED_MESSAGE);
    await expect(quickTuneService.uploadScriptContent('')).rejects.toThrow(DISABLED_MESSAGE);
  });

  it('rejects aux-function and reboot commands without legacy socket/REST contracts', async () => {
    await expect(quickTuneService.sendAuxFunction('start')).rejects.toThrow(DISABLED_MESSAGE);
    await expect(quickTuneService.rebootFC()).rejects.toThrow(DISABLED_MESSAGE);
  });

  it('rejects legacy CIRCLE mode and arm helpers', async () => {
    await expect(quickTuneService.setFlightMode('CIRCLE')).rejects.toThrow(DISABLED_MESSAGE);
    await expect(quickTuneService.armRover(true)).rejects.toThrow(DISABLED_MESSAGE);
  });

  it('rejects status reads without legacy /api/quicktune/status', async () => {
    await expect(quickTuneService.getStatus()).rejects.toThrow(DISABLED_MESSAGE);
  });
});
