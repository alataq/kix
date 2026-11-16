import { INT, VOID } from "./core-types";
import type { KixType } from "./core-types";

export type BuiltinIntrinsic = "syscall" | "system";

export interface BuiltinFunction {
  name: string;
  cName: string;
  returnType: KixType;
  params: KixType[];
  variadic: boolean;
  /** Optional code-generator lowering hook. */
  intrinsic?: BuiltinIntrinsic;
}

/**
 * The complete global builtin function surface.
 *
 * Kix source never sees a double-underscore identifier. These names are
 * ordinary language-level functions, and the implementation lives behind the
 * normal `kix_` C namespace.
 *
 * Syscall numbers are not compiler constants: they live in
 * modules/kix/syscalls.kix.
 */
export const BUILTIN_FUNCTIONS: readonly BuiltinFunction[] = [
  {
    name: "syscall",
    cName: "kix_syscall",
    returnType: INT,
    params: [INT],
    variadic: true,
    intrinsic: "syscall",
  },
  { name: "syncMutexCreate", cName: "kix_sync_mutex_create", returnType: INT, params: [], variadic: false },
  { name: "syncMutexLock", cName: "kix_sync_mutex_lock", returnType: VOID, params: [INT], variadic: false },
  { name: "syncMutexUnlock", cName: "kix_sync_mutex_unlock", returnType: VOID, params: [INT], variadic: false },
  { name: "syncMutexDestroy", cName: "kix_sync_mutex_destroy", returnType: VOID, params: [INT], variadic: false },
  { name: "syncCondvarCreate", cName: "kix_sync_condvar_create", returnType: INT, params: [], variadic: false },
  { name: "syncCondvarWait", cName: "kix_sync_condvar_wait", returnType: VOID, params: [INT, INT], variadic: false },
  { name: "syncCondvarSignal", cName: "kix_sync_condvar_signal", returnType: VOID, params: [INT], variadic: false },
  { name: "syncCondvarBroadcast", cName: "kix_sync_condvar_broadcast", returnType: VOID, params: [INT], variadic: false },
  { name: "syncCondvarDestroy", cName: "kix_sync_condvar_destroy", returnType: VOID, params: [INT], variadic: false },
  { name: "runCommand", cName: "kix_run_command", returnType: INT, params: [], variadic: true, intrinsic: "system" },
];

export function createBuiltinFunctionTable(): Map<string, BuiltinFunction> {
  return new Map(BUILTIN_FUNCTIONS.map((builtin) => [builtin.name, builtin]));
}
