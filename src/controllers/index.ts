import type { BrowserBinary } from '../browsers/types.js';
import type { AutomationController } from './types.js';

/**
 * Controller factory.
 *
 * Selection is driven by `binary.controller` (default 'playwright'). The
 * WebDriver controller dynamic-imports `selenium-webdriver` (an OPTIONAL dep) so
 * consumers who only use Playwright-driven engines never pull it in.
 */
export async function controllerFor(binary: BrowserBinary): Promise<AutomationController> {
  if (binary.controller === 'webdriver') {
    const { WebDriverController } = await import('./webdriver.js');
    return new WebDriverController();
  }
  const { PlaywrightController } = await import('./playwright.js');
  return new PlaywrightController();
}

export type { AutomationController, ControllerSession, SignalSinks } from './types.js';
