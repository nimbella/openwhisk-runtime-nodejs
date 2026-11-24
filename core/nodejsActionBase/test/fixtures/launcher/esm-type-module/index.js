// ESM: the exact shape that broke with LOG_DESTINATIONS (SERVERLESS-3979).
import { basename } from 'node:path';
export function main(args) {
  return { kind: 'esm-type-module', name: args.name, base: basename('/a/b.txt') };
}
