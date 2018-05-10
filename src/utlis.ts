export function camelCase(str: string) {
  return str.replace(/[-_ ]([a-z])/g, token => token[1].toUpperCase());
}
