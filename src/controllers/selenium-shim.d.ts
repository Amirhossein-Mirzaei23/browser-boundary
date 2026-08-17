/**
 * Ambient type shim for the OPTIONAL `selenium-webdriver` dependency.
 *
 * `selenium-webdriver` is dynamically imported at runtime by the WebDriver
 * controller (so consumers who never test historical Firefox don't need it
 * installed). But TypeScript needs type declarations to compile the controller
 * even when the package is absent from node_modules. This file provides the
 * minimal structural typing the controller relies on; it does NOT need to be a
 * faithful mirror of the full selenium-webdriver API.
 *
 * When `selenium-webdriver` IS installed, its own bundled types take precedence
 * (TypeScript resolves the real module before this ambient declaration), so this
 * shim only ever applies in the package's absence.
 */

declare module 'selenium-webdriver' {
  export interface WebDriverLogEntry {
    level: { value?: string; name?: string };
    message: string;
  }
  export interface WebDriverLogs {
    get(type: string): Promise<WebDriverLogEntry[]>;
  }
  export interface WebDriverTimeouts {
    pageLoadTimeout(ms: number): Promise<void>;
    implicit(ms: number): Promise<void>;
  }
  export interface WebDriverWindow {
    setRect(rect: { width: number; height: number }): Promise<void>;
  }
  export interface WebDriverManage {
    timeouts(): WebDriverTimeouts;
    logs(): WebDriverLogs;
    window(): WebDriverWindow;
  }
  export interface WebDriverElement {
    isElement(): boolean;
  }
  export interface WebDriverLike {
    get(url: string): Promise<void>;
    getWindowHandle(): Promise<string>;
    quit(): Promise<void>;
    executeScript<T>(script: string, ...args: unknown[]): Promise<T>;
    findElements(locator: { using: string; value: string }): Promise<WebDriverElement[]>;
    manage(): WebDriverManage;
    takeScreenshot(): Promise<string>;
    on?(event: string, handler: (e: unknown) => void): void;
  }
  export class Builder {
    forBrowser(name: string): this;
    setFirefoxOptions(options: unknown): this;
    usingServer(url: string): this;
    setLoggingPrefs(prefs: unknown): this;
    build(): Promise<WebDriverLike>;
  }
  export namespace logging {
    export enum Type {
      BROWSER = 'browser',
    }
    export enum Level {
      ALL = 'ALL',
    }
    export class Preferences {
      setLevel(type: Type, level: Level): void;
    }
  }
}

declare module 'selenium-webdriver/firefox' {
  export class Options {
    setBinary(path: string): void;
    addArguments(...args: string[]): void;
    setPreference(key: string, value: unknown): void;
  }
}
