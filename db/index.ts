export * as schema from "./schema";

export function assertServerSideDatabaseAccess() {
  throw new Error(
    "CFlow database access must live in the cloud API only. Do not import database clients into the Windows desktop app.",
  );
}
