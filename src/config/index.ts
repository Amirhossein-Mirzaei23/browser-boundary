export type { ScanConfig, PageSpec, ReadinessSpec, SearchStrategy, ResourceType } from './schema.js';
export { DEFAULTS } from './schema.js';
export {
  resolveConfig,
  resolvePageReadiness,
  ConfigError,
  toRegExp,
  type ResolvedConfig,
  type ResolvedPage,
} from './resolve.js';
