declare module 'proper-lockfile' {
  interface LockOptions {
    retries?: number | { retries: number; factor?: number; minTimeout?: number; maxTimeout?: number };
    stale?: number;
    update?: number;
    realpath?: boolean;
  }

  function lock(file: string, options?: LockOptions): Promise<() => Promise<void>>;
  function unlock(file: string, options?: { realpath?: boolean }): Promise<void>;
  function check(file: string, options?: { stale?: number; realpath?: boolean }): Promise<boolean>;

  export { lock, unlock, check };
  export default { lock, unlock, check };
}
