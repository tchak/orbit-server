import Source from './source';

export default interface Context {
  source: Source;
  headers?: Record<string, string>;
}
