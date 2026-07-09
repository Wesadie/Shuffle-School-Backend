import { AsyncLocalStorage } from "async_hooks";
import type { AccountContext } from "./accountContext";

const accountContextStorage = new AsyncLocalStorage<AccountContext>();

export function runWithAccountContext<T>(context: AccountContext, callback: () => T): T {
  return accountContextStorage.run(context, callback);
}

export function getCurrentAccountContext(): AccountContext | undefined {
  return accountContextStorage.getStore();
}

export function requireAccountId(accountId?: string): string {
  if (accountId) return accountId;
  const context = getCurrentAccountContext();
  if (!context?.accountId) {
    throw new Error("Account ID is required for school-owned storage operations");
  }
  return context.accountId;
}
